-- Safari Digital portal: private client details only Safari Digital can see
-- (monthly price for MRR, internal notes).
-- Run once in Supabase → SQL Editor, after 0006_cms.sql.
--
-- Clients can read their own row in public.clients, so anything private
-- lives in this separate admin-only table instead.

create table public.client_private (
  client_id uuid primary key references public.clients (id) on delete cascade,
  monthly_fee numeric(12, 2) check (monthly_fee >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'TZS')),
  billing_start date,
  notes text,
  updated_at timestamptz not null default now()
);
create trigger client_private_updated_at before update on public.client_private
  for each row execute function public.set_updated_at();

alter table public.client_private enable row level security;
create policy "Only admins see private client details" on public.client_private
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Move existing internal notes out of the table clients can read.
insert into public.client_private (client_id, notes)
select id, notes from public.clients where notes is not null
on conflict (client_id) do update set notes = excluded.notes;
update public.clients set notes = null where notes is not null;
