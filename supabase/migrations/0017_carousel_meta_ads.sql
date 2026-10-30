-- 1. Carousel ("slider") content: several images/videos in one item.
--    media_path stays the first slide; extra_media holds the rest, in order.
alter table public.content_items drop constraint if exists content_items_kind_check;
alter table public.content_items add constraint content_items_kind_check check (kind in ('reel', 'post', 'story', 'ad', 'carousel'));
alter table public.content_items add column if not exists extra_media jsonb not null default '[]'::jsonb;

-- 2. Ads synced from each client's Meta ad account (creative + last 30 days of results).
create table if not exists public.meta_ads (
  id text primary key,                         -- Meta ad id
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null default '',
  status text not null default '',             -- Meta effective_status
  format text not null default 'image',        -- image | video | carousel
  title text,
  body text,
  link text,
  cta text,
  image_url text,                              -- main image / video thumbnail (Meta CDN, refreshed daily)
  cards jsonb not null default '[]'::jsonb,    -- carousel cards: [{image_url, title, link}]
  preview_url text,                            -- shareable preview on Facebook
  spend numeric not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  inquiries integer not null default 0,
  created_time timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists meta_ads_client on public.meta_ads (client_id, created_time desc);
alter table public.meta_ads enable row level security;
drop policy if exists "Admins manage meta ads" on public.meta_ads;
create policy "Admins manage meta ads" on public.meta_ads
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Clients read their meta ads" on public.meta_ads;
create policy "Clients read their meta ads" on public.meta_ads
  for select to authenticated using (client_id = public.my_client_id());
