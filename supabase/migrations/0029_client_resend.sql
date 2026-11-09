-- Safari Digital portal: each client can send follow-ups from their own Resend account.
-- The keys are only readable by the portal's server (service role). No one signed in can read them.
-- Run once in Supabase → SQL Editor, after 0028_autoreply.sql.

create table if not exists public.client_resend (
  client_id uuid primary key references public.clients(id) on delete cascade,
  api_key text not null,
  webhook_secret text,
  updated_at timestamptz not null default now()
);
alter table public.client_resend enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) can read or write.
revoke all on public.client_resend from anon, authenticated;
