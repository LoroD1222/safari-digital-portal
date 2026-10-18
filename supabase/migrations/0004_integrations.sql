-- Safari Digital portal: which outside accounts belong to each client.
-- Run once in Supabase → SQL Editor, after 0003_settings.sql.
-- Access tokens are NOT stored here; they live in Vercel's environment
-- variables and are only ever used on the server.

alter table public.clients
  add column vercel_project_id text,
  add column vercel_project_name text,
  add column meta_ad_account_id text,
  add column meta_page_id text;
