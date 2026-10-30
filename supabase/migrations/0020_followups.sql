-- Automatic follow-up emails to guests (portal › Follow-ups).
-- Off for every client until they switch it on. Emails go from the client's own
-- address, which Safari Digital sets up (a domain verified in Resend).

-- 1. One settings row per client.
create table if not exists public.followup_settings (
  client_id uuid primary key references public.clients (id) on delete cascade,
  enabled boolean not null default false,
  template text not null default 'standard',
  enabled_at timestamptz,
  -- Set by Safari Digital only:
  from_email text,
  from_name text,
  sender_ready boolean not null default false,
  sender_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint followup_settings_template check (template in ('standard', 'gentle', 'persistent'))
);
alter table public.followup_settings enable row level security;
drop policy if exists "Admins manage follow-up settings" on public.followup_settings;
create policy "Admins manage follow-up settings" on public.followup_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Clients read their follow-up settings" on public.followup_settings;
create policy "Clients read their follow-up settings" on public.followup_settings
  for select to authenticated using (client_id = public.my_client_id());

-- Clients change only the switch and the template (never the sender).
create or replace function public.set_followups(p_client_id uuid, p_enabled boolean, p_template text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or p_client_id = public.my_client_id()) then
    raise exception 'Not allowed';
  end if;
  if p_template not in ('standard', 'gentle', 'persistent') then
    raise exception 'Unknown template';
  end if;
  insert into public.followup_settings (client_id, enabled, template, enabled_at)
  values (p_client_id, p_enabled, p_template, case when p_enabled then now() end)
  on conflict (client_id) do update
     set enabled = excluded.enabled,
         template = excluded.template,
         enabled_at = case when excluded.enabled and not public.followup_settings.enabled then now()
                           else public.followup_settings.enabled_at end,
         updated_at = now();
end;
$$;
revoke execute on function public.set_followups(uuid, boolean, text) from public, anon;
grant execute on function public.set_followups(uuid, boolean, text) to authenticated;

-- 2. The follow-ups themselves. preset = which template email it came from; null = the client's own.
create table if not exists public.followup_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  preset text,
  stage public.inquiry_status not null,
  days integer not null,
  name text not null,
  subject text not null,
  body text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint followup_rules_stage check (stage in ('contacted', 'quoted', 'negotiating')),
  constraint followup_rules_days check (days between 1 and 60),
  constraint followup_rules_text check (
    char_length(trim(name)) between 1 and 80 and
    char_length(trim(subject)) between 1 and 150 and
    char_length(trim(body)) between 1 and 4000)
);
create index if not exists followup_rules_client on public.followup_rules (client_id, stage, days);
alter table public.followup_rules enable row level security;
drop policy if exists "Clients and admins manage follow-ups" on public.followup_rules;
create policy "Clients and admins manage follow-ups" on public.followup_rules
  for all to authenticated
  using (public.is_admin() or client_id = public.my_client_id())
  with check (public.is_admin() or client_id = public.my_client_id());

-- 3. Every follow-up sent, by email (automatic) or WhatsApp (one tap by the client).
--    Unique per inquiry, follow-up, stage visit and channel, so nothing goes twice.
create table if not exists public.followup_sends (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  rule_id uuid references public.followup_rules (id) on delete set null,
  rule_name text not null,
  stage public.inquiry_status not null,
  stage_since timestamptz not null,
  channel text not null default 'email',
  to_address text not null,
  subject text not null,
  status text not null default 'sending',
  error text,
  created_at timestamptz not null default now(),
  constraint followup_sends_status check (status in ('sending', 'sent', 'failed')),
  constraint followup_sends_channel check (channel in ('email', 'whatsapp')),
  constraint followup_sends_once unique (inquiry_id, rule_id, stage_since, channel)
);
create index if not exists followup_sends_client on public.followup_sends (client_id, created_at desc);
create index if not exists followup_sends_inquiry on public.followup_sends (inquiry_id, created_at desc);
alter table public.followup_sends enable row level security;
drop policy if exists "Admins manage follow-up sends" on public.followup_sends;
create policy "Admins manage follow-up sends" on public.followup_sends
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Clients read their follow-up sends" on public.followup_sends;
create policy "Clients read their follow-up sends" on public.followup_sends
  for select to authenticated using (client_id = public.my_client_id());

-- 4. A guest who unsubscribed (or whose follow-ups were stopped) gets no more.
alter table public.inquiries add column if not exists followups_stopped_at timestamptz;

-- 5. The client tapped "Send on WhatsApp": record it so the guest drops off the list.
create or replace function public.log_whatsapp_followup(p_inquiry_id uuid, p_rule_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.inquiries%rowtype;
  r public.followup_rules%rowtype;
begin
  select * into q from public.inquiries where id = p_inquiry_id;
  select * into r from public.followup_rules where id = p_rule_id;
  if q.id is null or r.id is null or q.client_id <> r.client_id
     or not (public.is_admin() or q.client_id = public.my_client_id()) then
    raise exception 'Not allowed';
  end if;
  insert into public.followup_sends (client_id, inquiry_id, rule_id, rule_name, stage, stage_since, channel, to_address, subject, status)
  values (q.client_id, q.id, r.id, r.name, q.status, q.stage_changed_at, 'whatsapp', coalesce(q.phone, ''), r.subject, 'sent')
  on conflict on constraint followup_sends_once do nothing;
end;
$$;
revoke execute on function public.log_whatsapp_followup(uuid, uuid) from public, anon;
grant execute on function public.log_whatsapp_followup(uuid, uuid) to authenticated;
