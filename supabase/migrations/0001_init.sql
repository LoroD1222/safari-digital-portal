-- Safari Digital portal: first schema.
-- Run once in Supabase → SQL Editor (paste the whole file, then Run).
-- Every table has Row Level Security on: admins see everything,
-- clients only ever see rows that belong to their own company.

-- ───────────────────────── Types ─────────────────────────
create type public.user_role as enum ('admin', 'client');
create type public.onboarding_status as enum ('not_started', 'in_progress', 'submitted', 'being_reviewed', 'setup_complete');
create type public.account_status as enum ('invited', 'active', 'paused');
create type public.inquiry_source as enum ('meta_ads', 'meta_organic', 'website', 'direct', 'unknown');
create type public.inquiry_status as enum ('new', 'contacted', 'booked', 'closed');

-- ───────────────────────── Shared helpers ─────────────────────────
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ───────────────────────── Clients (tour operators) ─────────────────────────
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  contact_name text,
  contact_email text,
  whatsapp text,
  website_url text,
  marketing_package text check (marketing_package in ('starter', 'core', 'elite')),
  website_package text check (website_package in ('full_build')),
  onboarding_status public.onboarding_status not null default 'not_started',
  account_status public.account_status not null default 'invited',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- ───────────────────────── Profiles (one per sign-in) ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'client',
  client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now()
);

-- New sign-ins get a profile automatically. Everyone starts as a client
-- with no company; an admin links them to a client afterwards.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Used inside policies. security definer so they can read profiles
-- without tripping over profiles' own policies.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.my_client_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- ───────────────────────── Inquiries ─────────────────────────
-- source  = where the person first found the operator (marketing attribution)
-- channel = how they got in touch
-- origin  = how the record got into the portal (manual today, integrations later)
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  customer_name text not null check (length(trim(customer_name)) > 0),
  email text,
  phone text,
  country text,
  interested_in text,
  travel_dates text,
  travellers text,
  message text,
  source public.inquiry_source not null default 'unknown',
  campaign text,
  channel text not null default 'other' check (channel in (
    'website_form', 'meta_lead_form', 'whatsapp', 'facebook_message', 'instagram_message', 'email', 'phone', 'other')),
  status public.inquiry_status not null default 'new',
  received_at timestamptz not null default now(),
  origin text not null default 'manual' check (origin in ('manual', 'website_form', 'meta_lead_form', 'whatsapp', 'meta_messages')),
  external_id text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inquiries_has_contact check (coalesce(email, phone) is not null)
);
create trigger inquiries_updated_at before update on public.inquiries
  for each row execute function public.set_updated_at();
-- An integration can never insert the same lead twice.
create unique index inquiries_origin_external_id on public.inquiries (origin, external_id) where external_id is not null;
create index inquiries_client_received on public.inquiries (client_id, received_at desc);
create index inquiries_client_email on public.inquiries (client_id, lower(email));
create index inquiries_client_phone on public.inquiries (client_id, phone);

-- Clients may change the status of their own inquiries, nothing else.
create function public.set_inquiry_status(inquiry_id uuid, new_status public.inquiry_status) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.inquiries
     set status = new_status
   where id = inquiry_id
     and (public.is_admin() or client_id = public.my_client_id());
  if not found then
    raise exception 'Inquiry not found';
  end if;
end;
$$;

-- ───────────────────────── Row Level Security ─────────────────────────
alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.inquiries enable row level security;

create policy "Admins manage clients" on public.clients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients read their own company" on public.clients
  for select to authenticated using (id = public.my_client_id());

create policy "Admins manage profiles" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "People read their own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "Admins manage inquiries" on public.inquiries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients read their own inquiries" on public.inquiries
  for select to authenticated using (client_id = public.my_client_id());

revoke execute on function public.set_inquiry_status(uuid, public.inquiry_status) from public, anon;
grant execute on function public.set_inquiry_status(uuid, public.inquiry_status) to authenticated;
