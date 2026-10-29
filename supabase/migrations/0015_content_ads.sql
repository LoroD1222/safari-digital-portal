-- Content that will also run as a Facebook & Instagram ad.
alter table public.content_items add column if not exists as_ad boolean not null default false;
