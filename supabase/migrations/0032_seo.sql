-- Safari Digital portal: SEO as a service.
-- An SEO client has its own onboarding (Search Console access, keywords, competitors), an SEO tab with
-- Google results synced daily from Search Console, tracked keywords, a monthly work log written by us,
-- an SEO plan (a number of months, each with its own name, price and backlinks cost) and backlinks per month.
-- Run once in Supabase → SQL Editor, after 0031_followup_new_stage.sql.

alter table public.clients add column if not exists seo_enabled boolean not null default false;
alter table public.clients add column if not exists gsc_site text;           -- Search Console property, e.g. sc-domain:asanja.com
alter table public.clients add column if not exists seo_synced_at timestamptz;
alter table public.clients add column if not exists seo_sync_error text;
alter table public.clients add column if not exists seo_start date;          -- first day of SEO plan month 1

-- The SEO plan: month 1..N, each with its own name, price and backlinks cost (in the client's currency).
create table if not exists public.seo_plan (
  client_id uuid not null references public.clients(id) on delete cascade,
  month_no integer not null check (month_no between 1 and 36),
  title text not null default '',
  price numeric(12, 2) not null default 0 check (price >= 0),
  backlinks numeric(12, 2) not null default 0 check (backlinks >= 0),
  primary key (client_id, month_no)
);

-- Backlinks we build, per plan month.
create table if not exists public.seo_backlinks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  month date not null,                       -- first day of the calendar month
  site text not null check (length(trim(site)) between 1 and 200),
  url text,
  anchor text,
  authority integer check (authority between 0 and 100),
  cost numeric(12, 2) check (cost >= 0),
  status text not null default 'planned' check (status in ('planned', 'live', 'lost')),
  created_at timestamptz not null default now()
);
create index if not exists seo_backlinks_client_month on public.seo_backlinks (client_id, month);

-- Clicks, impressions and average position per day (Google Search, all countries).
create table if not exists public.seo_daily (
  client_id uuid not null references public.clients(id) on delete cascade,
  day date not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  position numeric(6, 2),
  primary key (client_id, day)
);

-- Top searches and pages: the last 28 days, with the 28 days before for comparison. Replaced on each sync.
create table if not exists public.seo_top (
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('query', 'page')),
  key text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  position numeric(6, 2),
  prev_clicks integer,
  prev_position numeric(6, 2),
  primary key (client_id, kind, key)
);

-- Keywords we track for the client, with their latest Google position (last 7 days) and the 7 days before.
create table if not exists public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  keyword text not null check (length(trim(keyword)) between 1 and 120),
  position numeric(6, 2),
  prev_position numeric(6, 2),
  clicks integer,
  impressions integer,
  best_page text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists seo_keywords_unique on public.seo_keywords (client_id, lower(keyword));

-- What Safari Digital did each month, shown to the client.
create table if not exists public.seo_work (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  month date not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);

alter table public.seo_daily enable row level security;
alter table public.seo_top enable row level security;
alter table public.seo_keywords enable row level security;
alter table public.seo_work enable row level security;
alter table public.seo_plan enable row level security;
alter table public.seo_backlinks enable row level security;

do $$
declare t text;
begin
  foreach t in array array['seo_daily', 'seo_top', 'seo_keywords', 'seo_work', 'seo_plan', 'seo_backlinks'] loop
    execute format('drop policy if exists "Admins manage %1$s" on public.%1$I', t);
    execute format('create policy "Admins manage %1$s" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('drop policy if exists "Clients read their %1$s" on public.%1$I', t);
    execute format('create policy "Clients read their %1$s" on public.%1$I for select to authenticated using (client_id = public.my_client_id())', t);
  end loop;
end $$;
