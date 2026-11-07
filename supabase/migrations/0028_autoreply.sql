-- Safari Digital portal: an instant reply to the guest when a website inquiry comes in.
-- Sent from the operator's connected follow-up address. Off until the operator turns it on.
-- Run once in Supabase → SQL Editor, after 0027_no_answer.sql.

alter table public.followup_settings add column if not exists autoreply_enabled boolean not null default false;
alter table public.followup_settings add column if not exists autoreply_subject text;
alter table public.followup_settings add column if not exists autoreply_body text;

-- What happened to each inquiry's instant reply. The status is claimed before sending, so it goes once.
alter table public.inquiries add column if not exists autoreply_status text;
alter table public.inquiries add column if not exists autoreply_at timestamptz;
alter table public.inquiries add column if not exists autoreply_error text;
alter table public.inquiries add column if not exists autoreply_provider_id text;
alter table public.inquiries drop constraint if exists inquiries_autoreply_status;
alter table public.inquiries add constraint inquiries_autoreply_status
  check (autoreply_status is null or autoreply_status in ('sending', 'sent', 'failed'));
create index if not exists inquiries_autoreply_provider on public.inquiries (autoreply_provider_id) where autoreply_provider_id is not null;

create or replace function public.set_followup_autoreply(p_client_id uuid, p_enabled boolean, p_subject text, p_body text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or p_client_id = public.my_client_id()) then
    raise exception 'Not allowed';
  end if;
  insert into public.followup_settings (client_id, autoreply_enabled, autoreply_subject, autoreply_body)
  values (p_client_id, coalesce(p_enabled, false), nullif(left(trim(coalesce(p_subject, '')), 150), ''), nullif(left(trim(coalesce(p_body, '')), 4000), ''))
  on conflict (client_id) do update
     set autoreply_enabled = excluded.autoreply_enabled,
         autoreply_subject = excluded.autoreply_subject,
         autoreply_body = excluded.autoreply_body,
         updated_at = now();
end;
$$;
revoke execute on function public.set_followup_autoreply(uuid, boolean, text, text) from public, anon;
grant execute on function public.set_followup_autoreply(uuid, boolean, text, text) to authenticated;
