-- Safari Digital portal: remembers which one-off emails went out (monthly
-- reports), so the daily job never sends the same one twice.
-- Run once in Supabase → SQL Editor, after 0010_packages.sql.
create table public.email_log (
  key text primary key,                 -- e.g. 'monthly:2026-10:<client id>'
  client_id uuid references public.clients (id) on delete cascade,
  sent_to text[],
  sent_at timestamptz not null default now()
);
alter table public.email_log enable row level security;
create policy "Only admins see the email log" on public.email_log
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
