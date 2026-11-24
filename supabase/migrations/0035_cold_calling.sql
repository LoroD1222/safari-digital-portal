-- Safari Digital portal: cold calling for Safari Digital's own (internal) account.
-- Upload call lists, work through a shared queue (two people never get the same number),
-- log each call, keep a Do-not-call list, and see which hours and lists pick up best.
-- Run once in Supabase → SQL Editor, after 0034_contacted_auto_start.sql.

create table if not exists public.call_lists (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  script text check (script is null or length(script) <= 6000),
  archived boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists call_lists_client on public.call_lists (client_id, created_at);

-- status: new (never called) · retry (no answer, try again) · callback (they asked us to call back)
--         interested · not_interested · wrong_number · unreachable (3 tries, no answer) · dnc
create table if not exists public.call_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  list_id uuid not null references public.call_lists(id) on delete cascade,
  company text check (company is null or length(company) <= 200),
  contact_name text check (contact_name is null or length(contact_name) <= 200),
  phone text not null check (phone ~ '^\+[0-9]{8,15}$'),
  email text check (email is null or length(email) <= 200),
  website text check (website is null or length(website) <= 300),
  city text check (city is null or length(city) <= 120),
  status text not null default 'new' check (status in ('new', 'retry', 'callback', 'interested', 'not_interested', 'wrong_number', 'unreachable', 'dnc')),
  attempts integer not null default 0,
  next_call_at timestamptz,
  last_called_at timestamptz,
  last_outcome text,
  claimed_by uuid,
  claimed_at timestamptz,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists call_contacts_list_phone on public.call_contacts (list_id, phone);
create index if not exists call_contacts_queue on public.call_contacts (client_id, status, next_call_at);
create index if not exists call_contacts_phone on public.call_contacts (client_id, phone);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  contact_id uuid not null references public.call_contacts(id) on delete cascade,
  list_id uuid references public.call_lists(id) on delete set null,
  user_id uuid default auth.uid(),
  outcome text not null check (outcome in ('no_answer', 'callback', 'interested', 'not_interested', 'wrong_number')),
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists call_logs_client_time on public.call_logs (client_id, created_at);
create index if not exists call_logs_contact on public.call_logs (contact_id, created_at);

-- Numbers we never call. Checked on every upload.
create table if not exists public.call_dnc (
  client_id uuid not null references public.clients(id) on delete cascade,
  phone text not null check (phone ~ '^\+[0-9]{8,15}$'),
  reason text check (reason is null or length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (client_id, phone)
);

create table if not exists public.call_settings (
  client_id uuid primary key references public.clients(id) on delete cascade,
  daily_target integer not null default 40 check (daily_target between 1 and 500),
  default_script text check (default_script is null or length(default_script) <= 6000),
  whatsapp_intro text check (whatsapp_intro is null or length(whatsapp_intro) <= 2000),
  interested_subject text check (interested_subject is null or length(interested_subject) <= 200),
  interested_body text check (interested_body is null or length(interested_body) <= 5000),
  case_study_url text check (case_study_url is null or case_study_url ~ '^https://'),
  case_study_name text check (case_study_name is null or length(case_study_name) <= 120),
  updated_at timestamptz not null default now()
);

alter table public.call_lists enable row level security;
alter table public.call_contacts enable row level security;
alter table public.call_logs enable row level security;
alter table public.call_dnc enable row level security;
alter table public.call_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['call_lists', 'call_contacts', 'call_logs', 'call_dnc', 'call_settings'] loop
    execute format('drop policy if exists "Admins manage %1$s" on public.%1$I', t);
    execute format('create policy "Admins manage %1$s" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('drop policy if exists "Internal accounts manage %1$s" on public.%1$I', t);
    execute format('create policy "Internal accounts manage %1$s" on public.%1$I for all to authenticated
      using (client_id = public.my_client_id() and public.is_internal_client(client_id))
      with check (client_id = public.my_client_id() and public.is_internal_client(client_id))', t);
  end loop;
end $$;

-- Can the signed-in user work this account's calls?
create or replace function public.can_call(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (p_client_id = public.my_client_id() and public.is_internal_client(p_client_id));
$$;
revoke execute on function public.can_call(uuid) from public, anon;
grant execute on function public.can_call(uuid) to authenticated;

-- A claim lasts 15 minutes; after that someone else may take the number.
-- Take one particular number. Returns false when a colleague is on it right now.
create or replace function public.claim_call(p_contact_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.call_contacts%rowtype;
begin
  select * into c from public.call_contacts where id = p_contact_id for update;
  if not found or not public.can_call(c.client_id) then raise exception 'Not allowed'; end if;
  if c.claimed_by is not null and c.claimed_by <> auth.uid() and c.claimed_at > now() - interval '15 minutes' then
    return false;
  end if;
  update public.call_contacts set claimed_by = null, claimed_at = null
   where client_id = c.client_id and claimed_by = auth.uid() and id <> c.id;
  update public.call_contacts set claimed_by = auth.uid(), claimed_at = now() where id = c.id;
  return true;
end;
$$;
revoke execute on function public.claim_call(uuid) from public, anon;
grant execute on function public.claim_call(uuid) to authenticated;

-- The next number to call: callbacks that are due first, then retries, then new numbers.
-- Numbers a colleague holds are skipped, so two people never call the same one.
create or replace function public.claim_next_call(p_client_id uuid, p_list_id uuid default null, p_skip uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.can_call(p_client_id) then raise exception 'Not allowed'; end if;
  select id into v from public.call_contacts c
   where c.client_id = p_client_id
     and (p_list_id is null or c.list_id = p_list_id)
     and (p_skip is null or c.id <> p_skip)
     and c.status in ('new', 'retry', 'callback')
     and (c.next_call_at is null or c.next_call_at <= now())
     and (c.claimed_by is null or c.claimed_by = auth.uid() or c.claimed_at <= now() - interval '15 minutes')
     and exists (select 1 from public.call_lists l where l.id = c.list_id and not l.archived)
   order by case c.status when 'callback' then 0 when 'retry' then 1 else 2 end, c.next_call_at nulls last, c.created_at, c.id
   limit 1
   for update skip locked;
  update public.call_contacts set claimed_by = null, claimed_at = null
   where client_id = p_client_id and claimed_by = auth.uid() and id is distinct from v;
  if v is not null then
    update public.call_contacts set claimed_by = auth.uid(), claimed_at = now() where id = v;
  end if;
  return v;
end;
$$;
revoke execute on function public.claim_next_call(uuid, uuid, uuid) from public, anon;
grant execute on function public.claim_next_call(uuid, uuid, uuid) to authenticated;

-- Let go of whatever number I hold (closing the page, skipping).
create or replace function public.release_calls(p_client_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.call_contacts set claimed_by = null, claimed_at = null
   where client_id = p_client_id and claimed_by = auth.uid() and public.can_call(p_client_id);
$$;
revoke execute on function public.release_calls(uuid) from public, anon;
grant execute on function public.release_calls(uuid) to authenticated;

-- Log a call and move the number on:
--   no answer → tomorrow 09:00 EAT (after the 3rd try: unreachable) · call back → at the time given
--   interested / not interested / wrong number → out of the queue (not interested can also go on Do not call)
create or replace function public.log_call(p_contact_id uuid, p_outcome text, p_note text default null, p_callback_at timestamptz default null, p_dnc boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare
  c public.call_contacts%rowtype;
  tries integer;
  next_status text;
  next_at timestamptz;
begin
  select * into c from public.call_contacts where id = p_contact_id for update;
  if not found or not public.can_call(c.client_id) then raise exception 'Not allowed'; end if;
  if c.claimed_by is not null and c.claimed_by <> auth.uid() and c.claimed_at > now() - interval '15 minutes' then
    raise exception 'Someone else is calling this number right now';
  end if;
  if p_outcome not in ('no_answer', 'callback', 'interested', 'not_interested', 'wrong_number') then raise exception 'Unknown outcome'; end if;
  if p_outcome = 'callback' and (p_callback_at is null or p_callback_at <= now()) then raise exception 'Pick a time in the future for the call back'; end if;
  tries := c.attempts + 1;
  next_status := case p_outcome
    when 'no_answer' then case when tries >= 3 then 'unreachable' else 'retry' end
    when 'callback' then 'callback'
    when 'not_interested' then case when p_dnc then 'dnc' else 'not_interested' end
    else p_outcome end;
  next_at := case
    when next_status = 'retry' then ((((now() at time zone 'UTC') + interval '3 hours')::date + 1) + time '06:00') at time zone 'UTC'
    when next_status = 'callback' then p_callback_at
    else null end;
  insert into public.call_logs (client_id, contact_id, list_id, outcome, note)
  values (c.client_id, c.id, c.list_id, p_outcome, nullif(trim(coalesce(p_note, '')), ''));
  update public.call_contacts
     set attempts = tries, status = next_status, next_call_at = next_at, last_called_at = now(), last_outcome = p_outcome,
         claimed_by = null, claimed_at = null
   where id = c.id;
  if p_outcome = 'not_interested' and p_dnc then
    insert into public.call_dnc (client_id, phone, reason) values (c.client_id, c.phone, 'Not interested') on conflict do nothing;
  end if;
  return next_status;
end;
$$;
revoke execute on function public.log_call(uuid, text, text, timestamptz, boolean) from public, anon;
grant execute on function public.log_call(uuid, text, text, timestamptz, boolean) to authenticated;

-- Adding a number to Do not call takes it out of every list's queue.
create or replace function public.call_dnc_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.call_contacts set status = 'dnc', next_call_at = null, claimed_by = null, claimed_at = null
   where client_id = new.client_id and phone = new.phone and status in ('new', 'retry', 'callback', 'unreachable');
  return null;
end;
$$;
drop trigger if exists call_dnc_apply on public.call_dnc;
create trigger call_dnc_apply after insert on public.call_dnc for each row execute function public.call_dnc_apply();
