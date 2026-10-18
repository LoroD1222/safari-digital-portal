-- Safari Digital portal: client onboarding.
-- Run once in Supabase → SQL Editor, after 0001_init.sql.

-- ───────────────────────── Answers ─────────────────────────
-- One row per client. Answers live in a JSON document so the questions can
-- change without a database change. Clients write it through the two
-- functions below; they never touch the table directly.
create table public.onboarding_responses (
  client_id uuid primary key references public.clients (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger onboarding_responses_updated_at before update on public.onboarding_responses
  for each row execute function public.set_updated_at();

alter table public.onboarding_responses enable row level security;
create policy "Admins manage onboarding" on public.onboarding_responses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients read their own onboarding" on public.onboarding_responses
  for select to authenticated using (client_id = public.my_client_id());

-- Save answers (called on every change). Moves "Not started" to "In progress".
create function public.save_onboarding(answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := public.my_client_id();
begin
  if cid is null then raise exception 'No client linked to this account'; end if;
  insert into public.onboarding_responses (client_id, data, updated_by)
  values (cid, answers, auth.uid())
  on conflict (client_id) do update set data = excluded.data, updated_by = excluded.updated_by;
  update public.clients set onboarding_status = 'in_progress'
   where id = cid and onboarding_status = 'not_started';
end;
$$;

-- Submit: stamps the time and moves the client to "Submitted" for review.
create function public.submit_onboarding() returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := public.my_client_id();
begin
  if cid is null then raise exception 'No client linked to this account'; end if;
  insert into public.onboarding_responses (client_id, submitted_at, updated_by)
  values (cid, now(), auth.uid())
  on conflict (client_id) do update set submitted_at = coalesce(public.onboarding_responses.submitted_at, now()), updated_by = auth.uid();
  update public.clients set onboarding_status = 'submitted'
   where id = cid and onboarding_status in ('not_started', 'in_progress');
end;
$$;

revoke execute on function public.save_onboarding(jsonb) from public, anon;
revoke execute on function public.submit_onboarding() from public, anon;
grant execute on function public.save_onboarding(jsonb) to authenticated;
grant execute on function public.submit_onboarding() to authenticated;

-- ───────────────────────── Files (logos, photos, itineraries) ─────────────────────────
-- Private bucket. Every file sits under a folder named after the client's id,
-- so a client can only ever reach their own folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('client-files', 'client-files', false, 52428800)
on conflict (id) do nothing;

create policy "Clients upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'client-files' and (storage.foldername(name))[1] = public.my_client_id()::text);
create policy "Clients see their own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'client-files' and (storage.foldername(name))[1] = public.my_client_id()::text);
create policy "Clients remove their own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'client-files' and (storage.foldername(name))[1] = public.my_client_id()::text);
create policy "Admins manage all client files" on storage.objects
  for all to authenticated
  using (bucket_id = 'client-files' and public.is_admin())
  with check (bucket_id = 'client-files' and public.is_admin());
