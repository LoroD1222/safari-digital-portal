-- Safari Digital portal: link to each client's Sanity Studio (website content editor).
-- Run once in Supabase → SQL Editor, after 0005_portal.sql.
alter table public.clients add column cms_url text;
