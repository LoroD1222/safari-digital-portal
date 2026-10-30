-- Inquiry pipeline: New → Contacted → Quote sent → Negotiating → Booked / Lost.
-- "closed" stays as the stored value and is shown as "Lost".

-- 1. Two new stages.
alter type public.inquiry_status add value if not exists 'quoted' after 'contacted';
alter type public.inquiry_status add value if not exists 'negotiating' after 'quoted';

-- 2. Deal details on each inquiry (all money in USD).
alter table public.inquiries add column if not exists trip_value numeric(12,2);
alter table public.inquiries add column if not exists follow_up_on date;
alter table public.inquiries add column if not exists notes text;
alter table public.inquiries add column if not exists lost_reason text;
alter table public.inquiries add column if not exists stage_changed_at timestamptz;
update public.inquiries set stage_changed_at = coalesce(updated_at, received_at) where stage_changed_at is null;
alter table public.inquiries alter column stage_changed_at set default now();
alter table public.inquiries alter column stage_changed_at set not null;
alter table public.inquiries drop constraint if exists inquiries_trip_value_check;
alter table public.inquiries add constraint inquiries_trip_value_check check (trip_value is null or trip_value >= 0);
create index if not exists inquiries_client_stage on public.inquiries (client_id, status, stage_changed_at desc);

-- 3. Stage history, written automatically.
create table if not exists public.inquiry_history (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  status public.inquiry_status not null,
  at timestamptz not null default now(),
  by_role text
);
create index if not exists inquiry_history_inquiry on public.inquiry_history (inquiry_id, at);
alter table public.inquiry_history enable row level security;
drop policy if exists "Admins manage inquiry history" on public.inquiry_history;
create policy "Admins manage inquiry history" on public.inquiry_history
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Clients read their inquiry history" on public.inquiry_history;
create policy "Clients read their inquiry history" on public.inquiry_history
  for select to authenticated using (client_id = public.my_client_id());

-- Existing inquiries start their history at their current stage.
insert into public.inquiry_history (inquiry_id, client_id, status, at, by_role)
select i.id, i.client_id, i.status, i.stage_changed_at, null
  from public.inquiries i
 where not exists (select 1 from public.inquiry_history h where h.inquiry_id = i.id);

create or replace function public.inquiries_stage_touch() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.stage_changed_at = now();
  end if;
  return new;
end;
$$;
drop trigger if exists inquiries_stage_touch on public.inquiries;
create trigger inquiries_stage_touch before update on public.inquiries
  for each row execute function public.inquiries_stage_touch();

create or replace function public.inquiries_log_stage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.inquiry_history (inquiry_id, client_id, status, by_role)
    values (new.id, new.client_id, new.status,
            case when auth.uid() is null then 'system' when public.is_admin() then 'admin' else 'client' end);
  end if;
  return null;
end;
$$;
drop trigger if exists inquiries_log_stage on public.inquiries;
create trigger inquiries_log_stage after insert or update of status on public.inquiries
  for each row execute function public.inquiries_log_stage();

-- 4. Clients (their own) and admins (any) can edit the deal details.
create or replace function public.update_inquiry_deal(
  inquiry_id uuid, p_trip_value numeric, p_follow_up_on date, p_notes text, p_lost_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_trip_value is not null and p_trip_value < 0 then
    raise exception 'Trip value can''t be negative';
  end if;
  update public.inquiries
     set trip_value = p_trip_value,
         follow_up_on = p_follow_up_on,
         notes = nullif(left(trim(coalesce(p_notes, '')), 5000), ''),
         lost_reason = nullif(left(trim(coalesce(p_lost_reason, '')), 200), '')
   where id = inquiry_id
     and (public.is_admin() or client_id = public.my_client_id());
  if not found then
    raise exception 'Inquiry not found';
  end if;
end;
$$;
revoke execute on function public.update_inquiry_deal(uuid, numeric, date, text, text) from public, anon;
grant execute on function public.update_inquiry_deal(uuid, numeric, date, text, text) to authenticated;
