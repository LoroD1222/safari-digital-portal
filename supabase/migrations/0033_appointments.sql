-- Safari Digital portal: appointment calendar for Safari Digital's own (internal) account.
-- We book meetings with leads (online with a Meet/Zoom link, or in person). Only internal clients can use it.
-- Run once in Supabase → SQL Editor, after 0032_seo.sql.

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 160),
  starts_at timestamptz not null,
  duration_min integer not null default 30 check (duration_min between 10 and 480),
  kind text not null default 'online' check (kind in ('online', 'in_person')),
  meeting_link text,
  location text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'no_show', 'canceled')),
  invite_sent_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointments_client_start on public.appointments (client_id, starts_at);
create index if not exists appointments_inquiry on public.appointments (inquiry_id);

-- Default meeting link and address for new appointments, per internal account.
alter table public.clients add column if not exists meeting_link text;
alter table public.clients add column if not exists meeting_address text;

alter table public.appointments enable row level security;

-- Is this one of our own (internal) accounts?
create or replace function public.is_internal_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_internal from public.clients where id = p_client_id), false);
$$;
revoke execute on function public.is_internal_client(uuid) from public, anon;
grant execute on function public.is_internal_client(uuid) to authenticated;

drop policy if exists "Admins manage appointments" on public.appointments;
create policy "Admins manage appointments" on public.appointments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Internal accounts manage their appointments" on public.appointments;
create policy "Internal accounts manage their appointments" on public.appointments for all to authenticated
  using (client_id = public.my_client_id() and public.is_internal_client(client_id))
  with check (client_id = public.my_client_id() and public.is_internal_client(client_id));

-- Saving the default meeting link / address (clients can't edit their own client row directly).
create or replace function public.set_meeting_defaults(p_client_id uuid, p_link text, p_address text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or (p_client_id = public.my_client_id() and public.is_internal_client(p_client_id))) then
    raise exception 'Not allowed';
  end if;
  update public.clients set meeting_link = nullif(trim(coalesce(p_link, '')), ''), meeting_address = nullif(trim(coalesce(p_address, '')), '')
   where id = p_client_id;
end;
$$;
revoke execute on function public.set_meeting_defaults(uuid, text, text) from public, anon;
grant execute on function public.set_meeting_defaults(uuid, text, text) to authenticated;
