-- Safari Digital portal: invoices.
-- Admins create, send and mark invoices paid. Clients see their own sent and
-- paid invoices (never drafts). Monthly drafts are prepared on the 1st.
-- Run once in Supabase → SQL Editor, after 0011_email_log.sql.

create sequence public.invoice_seq;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  number text not null unique,
  kind text not null default 'one_off' check (kind in ('monthly', 'one_off')),
  period_month date check (period_month is null or extract(day from period_month) = 1),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'cancelled')),
  currency text not null default 'USD' check (currency in ('USD', 'TZS')),
  issue_date date not null default current_date,
  due_date date not null default (current_date + 14),
  -- [{ "description": "...", "details": "...", "amount": 450 }] (a discount is a negative amount)
  items jsonb not null default '[]'::jsonb,
  total numeric(12, 2) not null default 0,
  notes text,
  sent_at timestamptz,
  paid_at date,
  payment_method text,
  payment_ref text,
  reminder_sent_at timestamptz,
  overdue_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One monthly invoice per client per month.
create unique index invoices_monthly_once on public.invoices (client_id, period_month) where kind = 'monthly' and status <> 'cancelled';
create index invoices_client on public.invoices (client_id, issue_date desc);
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

-- SD-2026-001, SD-2026-002… (the counter never repeats).
create function public.next_invoice_number() returns text
language sql security definer set search_path = '' as $$
  select 'SD-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 3, '0');
$$;
revoke execute on function public.next_invoice_number() from public, anon;
grant execute on function public.next_invoice_number() to authenticated, service_role;

alter table public.invoices enable row level security;
create policy "Admins manage invoices" on public.invoices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients see their sent invoices" on public.invoices
  for select to authenticated
  using (client_id = public.my_client_id() and status in ('sent', 'paid'));
