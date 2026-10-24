-- Safari Digital portal: send inquiry stages (Lead, Contacted, Booked) to each
-- client's Meta dataset through the Conversions API, so Meta learns which ads
-- bring real bookings. Run once in Supabase → SQL Editor, after 0007_billing.sql.

-- The client's Meta dataset (pixel). Events are only sent when this is set.
alter table public.clients add column meta_dataset_id text;

-- Meta click details from the website form, for matching the lead to the ad click.
alter table public.inquiries add column fbc text;
alter table public.inquiries add column fbp text;

-- One row per event sent (or tried). event_key stops the same event going twice.
create table public.meta_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  inquiry_id uuid references public.inquiries (id) on delete cascade,
  event_name text not null,
  event_key text not null unique,
  event_time timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index meta_events_client_created on public.meta_events (client_id, created_at desc);
create index meta_events_retry on public.meta_events (status, created_at) where status in ('pending', 'failed');

alter table public.meta_events enable row level security;
create policy "Only admins see Meta events" on public.meta_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
