-- "Ad" as its own content type (ad-only creative), next to Reel, Post and Story.
alter table public.content_items drop constraint if exists content_items_kind_check;
alter table public.content_items add constraint content_items_kind_check check (kind in ('reel', 'post', 'story', 'ad'));
