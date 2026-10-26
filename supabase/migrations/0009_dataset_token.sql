-- Safari Digital portal: an optional Conversions API token per client, for
-- datasets Meta won't let the client share with Safari Digital yet (new
-- business portfolios). Admin-only, like the rest of client_private.
-- Run once in Supabase → SQL Editor, after 0008_meta_events.sql.
alter table public.client_private add column meta_capi_token text;
