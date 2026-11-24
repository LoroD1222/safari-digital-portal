-- Safari Digital portal: moving a lead to Contacted starts its follow-ups straight away.
-- Being in Contacted means the operator already replied, so there's no "Did you send it?" step any more.
-- Quote sent and Negotiating still ask, because the quote or reply may not have gone out yet.
-- Run once in Supabase → SQL Editor, after 0033_appointments.sql.

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
  if tg_op = 'INSERT' and new.status::text = 'new' and new.origin = 'website_form' then
    -- A website inquiry starts its "New" follow-ups at once (e.g. an email 5 minutes later).
    insert into public.followup_cycles (client_id, inquiry_id, stage, started_at, confirmed_at, last_operator_at, status)
    values (new.client_id, new.id, 'new', now(), now(), now(), 'active');
  elsif new.status::text in ('contacted', 'no_show', 'no_answer') then
    insert into public.followup_cycles (client_id, inquiry_id, stage, started_at, confirmed_at, last_operator_at, status)
    values (new.client_id, new.id, new.status, now(), now(), now(), 'active');
  elsif new.status::text in ('quoted', 'negotiating') then
    insert into public.followup_cycles (client_id, inquiry_id, stage, started_at)
    values (new.client_id, new.id, new.status, now());
  end if;
  return null;
end;
$$;



-- Leads already waiting in Contacted for that confirmation start now (counted from today, so nothing piles up).
update public.followup_cycles
   set status = 'active', confirmed_at = now(), last_operator_at = now()
 where stage = 'contacted' and status = 'awaiting';
