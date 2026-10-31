-- Follow-ups, version 2: stage cycles, confirmed first messages, a full send record,
-- per-client email settings and suppressed addresses.
--
-- A "cycle" is one visit of an inquiry to a follow-up stage (Contacted, Quote sent, Negotiating).
-- Moving the card ends the cycle and starts a new one. Follow-ups only start counting once the
-- operator confirms they actually sent the message for that stage (confirmed_at).

-- 1. Settings the client controls.
alter table public.followup_settings add column if not exists agent_name text;
alter table public.followup_settings add column if not exists send_timezone text not null default 'Africa/Dar_es_Salaam';
alter table public.followup_settings add column if not exists quote_valid_days integer;
alter table public.followup_settings add column if not exists template_version integer not null default 1;
alter table public.followup_settings drop constraint if exists followup_settings_quote_days;
alter table public.followup_settings add constraint followup_settings_quote_days
  check (quote_valid_days is null or quote_valid_days between 1 and 365);

create or replace function public.set_followup_prefs(p_client_id uuid, p_agent_name text, p_timezone text, p_quote_valid_days integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or p_client_id = public.my_client_id()) then
    raise exception 'Not allowed';
  end if;
  if p_timezone is null or p_timezone !~ '^[A-Za-z_]+(/[A-Za-z_+-]+)*$' then
    raise exception 'Unknown time zone';
  end if;
  insert into public.followup_settings (client_id, agent_name, send_timezone, quote_valid_days)
  values (p_client_id, nullif(left(trim(coalesce(p_agent_name, '')), 80), ''), p_timezone, p_quote_valid_days)
  on conflict (client_id) do update
     set agent_name = excluded.agent_name,
         send_timezone = excluded.send_timezone,
         quote_valid_days = excluded.quote_valid_days,
         updated_at = now();
end;
$$;
revoke execute on function public.set_followup_prefs(uuid, text, text, integer) from public, anon;
grant execute on function public.set_followup_prefs(uuid, text, text, integer) to authenticated;

-- Which version of Safari Digital's template copy the client's rules come from.
create or replace function public.set_followup_template_version(p_client_id uuid, p_version integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or p_client_id = public.my_client_id()) then
    raise exception 'Not allowed';
  end if;
  insert into public.followup_settings (client_id, template_version) values (p_client_id, p_version)
  on conflict (client_id) do update set template_version = excluded.template_version, updated_at = now();
end;
$$;
revoke execute on function public.set_followup_template_version(uuid, integer) from public, anon;
grant execute on function public.set_followup_template_version(uuid, integer) to authenticated;

-- 2. Rules: the template step (G1, S4, P12…) and when the timing last changed.
--    A step that became due before its timing changed is skipped, never sent late.
alter table public.followup_rules add column if not exists step text;
alter table public.followup_rules add column if not exists timing_changed_at timestamptz not null default now();
-- Signatures are added automatically now: drop the old default sign-off from the client's own follow-ups.
update public.followup_rules
   set body = regexp_replace(body, E'\\s*Best regards,\\s*\\n\\s*(\\[Company name\\]|\\{company\\})\\s*$', '')
 where preset is null;

-- 3. Stage cycles.
create table if not exists public.followup_cycles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  stage public.inquiry_status not null,
  started_at timestamptz not null default now(),
  confirmed_at timestamptz,
  last_operator_at timestamptz,
  status text not null default 'awaiting',
  pause_reason text,
  resumed_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  constraint followup_cycles_status check (status in ('awaiting', 'active', 'paused', 'replied', 'ended')),
  constraint followup_cycles_stage check (stage in ('contacted', 'quoted', 'negotiating'))
);
create unique index if not exists followup_cycles_open on public.followup_cycles (inquiry_id) where status <> 'ended';
create index if not exists followup_cycles_client on public.followup_cycles (client_id, status);
alter table public.followup_cycles enable row level security;
drop policy if exists "Admins manage follow-up cycles" on public.followup_cycles;
create policy "Admins manage follow-up cycles" on public.followup_cycles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Clients read their follow-up cycles" on public.followup_cycles;
create policy "Clients read their follow-up cycles" on public.followup_cycles
  for select to authenticated using (client_id = public.my_client_id());

-- 4. The send record: one row per step per cycle and channel.
alter table public.followup_sends add column if not exists cycle_id uuid references public.followup_cycles (id) on delete set null;
alter table public.followup_sends add column if not exists step_key text;
alter table public.followup_sends add column if not exists template text;
alter table public.followup_sends add column if not exists scheduled_for timestamptz;
alter table public.followup_sends add column if not exists sent_at timestamptz;
alter table public.followup_sends add column if not exists provider_id text;
alter table public.followup_sends add column if not exists message_id text;
alter table public.followup_sends add column if not exists attempts integer not null default 0;
alter table public.followup_sends drop constraint if exists followup_sends_status;
alter table public.followup_sends add constraint followup_sends_status
  check (status in ('scheduled', 'sending', 'sent', 'failed', 'canceled', 'skipped'));
-- Not partial, so it can back ON CONFLICT; older rows have no cycle_id and nulls never clash.
create unique index if not exists followup_sends_step on public.followup_sends (cycle_id, step_key, channel);
create index if not exists followup_sends_provider on public.followup_sends (provider_id) where provider_id is not null;

-- 5. Addresses that must never get a follow-up again (bounce, spam complaint, unsubscribe).
create table if not exists public.followup_suppressions (
  client_id uuid not null references public.clients (id) on delete cascade,
  email text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (client_id, email)
);
alter table public.followup_suppressions enable row level security;
drop policy if exists "Admins manage suppressions" on public.followup_suppressions;
create policy "Admins manage suppressions" on public.followup_suppressions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Clients read their suppressions" on public.followup_suppressions;
create policy "Clients read their suppressions" on public.followup_suppressions
  for select to authenticated using (client_id = public.my_client_id());

alter table public.inquiries add column if not exists followups_stop_reason text;

-- 6. Moving a card ends the open cycle (cancelling its unsent steps) and opens a new one.
create or replace function public.followup_cycle_on_stage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.followup_cycles%rowtype;
  why text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  why := case new.status when 'booked' then 'Booked' when 'closed' then 'Lost' else 'Moved to another stage' end;
  for c in select * from public.followup_cycles where inquiry_id = new.id and status <> 'ended' loop
    if c.confirmed_at is not null then
      insert into public.followup_sends (client_id, inquiry_id, rule_id, rule_name, stage, stage_since, channel, to_address, subject, status, cycle_id, step_key, error)
      select new.client_id, new.id, r.id, coalesce(r.step, r.name), c.stage, c.started_at, 'email', coalesce(new.email, ''), r.subject, 'canceled', c.id, r.id::text, why
        from public.followup_rules r
       where r.client_id = new.client_id and r.stage = c.stage and r.enabled
         and not exists (select 1 from public.followup_sends s where s.cycle_id = c.id and s.step_key = r.id::text and s.channel = 'email')
      on conflict do nothing;
    end if;
    update public.followup_cycles set status = 'ended', ended_at = now(), end_reason = why where id = c.id;
  end loop;
  if new.status in ('contacted', 'quoted', 'negotiating') then
    insert into public.followup_cycles (client_id, inquiry_id, stage, started_at)
    values (new.client_id, new.id, new.status, now());
  end if;
  return null;
end;
$$;
drop trigger if exists followup_cycle_on_stage on public.inquiries;
create trigger followup_cycle_on_stage after insert or update of status on public.inquiries
  for each row execute function public.followup_cycle_on_stage();

-- Inquiries already in a follow-up stage get a cycle that waits for confirmation (never a backlog).
insert into public.followup_cycles (client_id, inquiry_id, stage, started_at)
select i.client_id, i.id, i.status, coalesce(i.stage_changed_at, i.received_at)
  from public.inquiries i
 where i.status in ('contacted', 'quoted', 'negotiating')
   and not exists (select 1 from public.followup_cycles c where c.inquiry_id = i.id and c.status <> 'ended');

-- 7. Operator actions on one inquiry.
create or replace function public.open_followup_cycle(p_inquiry_id uuid) returns public.followup_cycles
language plpgsql security definer set search_path = '' as $$
declare
  q public.inquiries%rowtype;
  c public.followup_cycles%rowtype;
begin
  select * into q from public.inquiries where id = p_inquiry_id;
  if q.id is null or not (public.is_admin() or q.client_id = public.my_client_id()) then
    raise exception 'Inquiry not found';
  end if;
  select * into c from public.followup_cycles where inquiry_id = q.id and status <> 'ended';
  if c.id is null then
    if q.status not in ('contacted', 'quoted', 'negotiating') then
      raise exception 'No follow-ups in this stage';
    end if;
    insert into public.followup_cycles (client_id, inquiry_id, stage, started_at)
    values (q.client_id, q.id, q.status, coalesce(q.stage_changed_at, now())) returning * into c;
  end if;
  return c;
end;
$$;
revoke execute on function public.open_followup_cycle(uuid) from public, anon, authenticated;

-- "I sent it": the schedule counts from p_at. Later calls log a manual message (postpones the next email).
create or replace function public.confirm_followup_message(p_inquiry_id uuid, p_at timestamptz default now())
returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.followup_cycles%rowtype;
  at timestamptz := least(coalesce(p_at, now()), now());
begin
  c := public.open_followup_cycle(p_inquiry_id);
  if at < c.started_at - interval '30 days' then
    at := c.started_at;
  end if;
  if c.status = 'awaiting' then
    update public.followup_cycles set status = 'active', confirmed_at = at, last_operator_at = at where id = c.id;
  else
    update public.followup_cycles set last_operator_at = greatest(coalesce(last_operator_at, at), at) where id = c.id;
  end if;
end;
$$;
revoke execute on function public.confirm_followup_message(uuid, timestamptz) from public, anon;
grant execute on function public.confirm_followup_message(uuid, timestamptz) to authenticated;

-- Pause ('paused'), guest replied ('replied') or resume ('active').
create or replace function public.set_followup_cycle_state(p_inquiry_id uuid, p_state text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.followup_cycles%rowtype;
begin
  if p_state not in ('paused', 'replied', 'active') then
    raise exception 'Unknown state';
  end if;
  c := public.open_followup_cycle(p_inquiry_id);
  if p_state = 'active' then
    update public.followup_cycles
       set status = case when confirmed_at is null then 'awaiting' else 'active' end,
           pause_reason = null, resumed_at = now()
     where id = c.id;
  else
    update public.followup_cycles
       set status = p_state, pause_reason = case p_state when 'replied' then 'Guest replied' else 'Paused by you' end
     where id = c.id;
  end if;
end;
$$;
revoke execute on function public.set_followup_cycle_state(uuid, text) from public, anon;
grant execute on function public.set_followup_cycle_state(uuid, text) to authenticated;

-- 8. "Send on WhatsApp" now records the cycle and step too, so the guest drops off the list for that step only.
create or replace function public.log_whatsapp_followup(p_inquiry_id uuid, p_rule_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.inquiries%rowtype;
  r public.followup_rules%rowtype;
  c public.followup_cycles%rowtype;
begin
  select * into q from public.inquiries where id = p_inquiry_id;
  select * into r from public.followup_rules where id = p_rule_id;
  if q.id is null or r.id is null or q.client_id <> r.client_id
     or not (public.is_admin() or q.client_id = public.my_client_id()) then
    raise exception 'Not allowed';
  end if;
  select * into c from public.followup_cycles where inquiry_id = q.id and status <> 'ended';
  insert into public.followup_sends (client_id, inquiry_id, rule_id, rule_name, stage, stage_since, channel, to_address, subject, status, cycle_id, step_key, sent_at)
  values (q.client_id, q.id, r.id, coalesce(r.step, r.name), q.status, coalesce(c.started_at, q.stage_changed_at), 'whatsapp', coalesce(q.phone, ''), r.subject, 'sent', c.id, r.id::text, now())
  on conflict do nothing;
end;
$$;
