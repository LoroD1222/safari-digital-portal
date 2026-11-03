-- Two extra pipeline stages, used by Safari Digital's own (internal) account:
-- Meeting booked and No show. Clients' pipelines don't show them.
-- Text comparisons (::text) are used below so this runs in one go with the new enum values.

alter type public.inquiry_status add value if not exists 'meeting' after 'contacted';
alter type public.inquiry_status add value if not exists 'no_show' after 'meeting';

-- Follow-ups can also run in No show (e.g. "Sorry we missed you").
alter table public.followup_rules drop constraint if exists followup_rules_stage;
alter table public.followup_rules add constraint followup_rules_stage
  check (stage::text in ('contacted', 'quoted', 'negotiating', 'no_show'));
alter table public.followup_cycles drop constraint if exists followup_cycles_stage;
alter table public.followup_cycles add constraint followup_cycles_stage
  check (stage::text in ('contacted', 'quoted', 'negotiating', 'no_show'));

-- Moving a card: a No show cycle starts at once (moving the card is the confirmation),
-- the other follow-up stages still wait for "I sent it".
create or replace function public.followup_cycle_on_stage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.followup_cycles%rowtype;
  why text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  why := case new.status::text when 'booked' then 'Booked' when 'closed' then 'Lost' else 'Moved to another stage' end;
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
  if new.status::text = 'no_show' then
    insert into public.followup_cycles (client_id, inquiry_id, stage, started_at, confirmed_at, last_operator_at, status)
    values (new.client_id, new.id, new.status, now(), now(), now(), 'active');
  elsif new.status::text in ('contacted', 'quoted', 'negotiating') then
    insert into public.followup_cycles (client_id, inquiry_id, stage, started_at)
    values (new.client_id, new.id, new.status, now());
  end if;
  return null;
end;
$$;

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
    if q.status::text not in ('contacted', 'quoted', 'negotiating', 'no_show') then
      raise exception 'No follow-ups in this stage';
    end if;
    insert into public.followup_cycles (client_id, inquiry_id, stage, started_at)
    values (q.client_id, q.id, q.status, coalesce(q.stage_changed_at, now())) returning * into c;
  end if;
  return c;
end;
$$;
revoke execute on function public.open_followup_cycle(uuid) from public, anon, authenticated;
