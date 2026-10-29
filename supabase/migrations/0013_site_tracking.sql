-- Safari Digital portal: visitor counting for websites that aren't on Vercel
-- (WordPress, Wix, …) through the Safari Digital snippet. No cookies; a visitor is
-- an anonymous daily hash, so nobody can be identified.
-- Run once in Supabase → SQL Editor, after 0012_invoices.sql.

alter table public.clients add column tracking_since timestamptz;

create table public.page_views (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  at timestamptz not null default now(),
  visitor text not null,          -- anonymous hash, changes every day
  path text not null,
  referrer text,
  country text,
  device text check (device in ('mobile', 'tablet', 'desktop'))
);
create index page_views_client_at on public.page_views (client_id, at desc);

alter table public.page_views enable row level security;
create policy "Only admins read page views" on public.page_views
  for select to authenticated using (public.is_admin());
