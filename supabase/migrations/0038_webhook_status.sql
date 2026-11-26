-- Safari Digital portal: remember how each client's Resend webhook last went,
-- so the Follow-up emails card can show "working" or what's wrong.
-- Run once in Supabase → SQL Editor, after 0037_call_order.sql.

alter table public.client_resend add column if not exists webhook_last_at timestamptz;
alter table public.client_resend add column if not exists webhook_last_error text;
