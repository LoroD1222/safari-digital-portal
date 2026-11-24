-- Safari Digital portal: a country and an address for each number in a cold-calling list.
-- Run once in Supabase → SQL Editor, after 0035_cold_calling.sql.

alter table public.call_contacts add column if not exists country text;
alter table public.call_contacts drop constraint if exists call_contacts_country_len;
alter table public.call_contacts add constraint call_contacts_country_len check (country is null or length(country) <= 80);
create index if not exists call_contacts_country on public.call_contacts (client_id, country);

-- And a street address (the city stays its own field).
alter table public.call_contacts add column if not exists address text;
alter table public.call_contacts drop constraint if exists call_contacts_address_len;
alter table public.call_contacts add constraint call_contacts_address_len check (address is null or length(address) <= 300);

drop function if exists public.claim_next_call(uuid, uuid, uuid);
-- The next number to call, now optionally from one country only: callbacks that are due first, then retries, then new numbers.
-- Numbers a colleague holds are skipped, so two people never call the same one.
create or replace function public.claim_next_call(p_client_id uuid, p_list_id uuid default null, p_skip uuid default null, p_country text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.can_call(p_client_id) then raise exception 'Not allowed'; end if;
  select id into v from public.call_contacts c
   where c.client_id = p_client_id
     and (p_list_id is null or c.list_id = p_list_id)
     and (p_skip is null or c.id <> p_skip)
     and (p_country is null or c.country = p_country or (p_country = '' and c.country is null))
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
revoke execute on function public.claim_next_call(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.claim_next_call(uuid, uuid, uuid, text) to authenticated;
