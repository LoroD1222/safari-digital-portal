-- Safari Digital portal: cold calling goes through a list in the order of the file,
-- keeps rows that have no phone number yet (add one later), and keeps a second number.
-- Run once in Supabase → SQL Editor, after 0036_call_country.sql.

-- 1. The row's place in its list (1 = first row of the file).
alter table public.call_contacts add column if not exists position integer;
-- Numbers already uploaded: keep the order they were saved in.
with ordered as (
  select id, row_number() over (partition by list_id order by created_at, ctid) as n
    from public.call_contacts where position is null
)
update public.call_contacts c set position = o.n from ordered o where o.id = c.id;
create index if not exists call_contacts_list_position on public.call_contacts (list_id, position);

-- 2. Rows without a phone number can be kept (they stay out of the queue until a number is added).
alter table public.call_contacts alter column phone drop not null;

-- 3. A second phone number, when the file has two.
alter table public.call_contacts add column if not exists other_phone text;
alter table public.call_contacts drop constraint if exists call_contacts_other_phone_len;
alter table public.call_contacts add constraint call_contacts_other_phone_len check (other_phone is null or length(other_phone) <= 120);

-- 4. The next number: due call backs, then retries, then new numbers in the order of the list
--    (oldest list first when calling "All lists"). Never random. Rows without a phone are skipped.
create or replace function public.claim_next_call(p_client_id uuid, p_list_id uuid default null, p_skip uuid default null, p_country text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.can_call(p_client_id) then raise exception 'Not allowed'; end if;
  select c.id into v from public.call_contacts c
    join public.call_lists l on l.id = c.list_id and not l.archived
   where c.client_id = p_client_id
     and c.phone is not null
     and (p_list_id is null or c.list_id = p_list_id)
     and (p_skip is null or c.id <> p_skip)
     and (p_country is null or c.country = p_country or (p_country = '' and c.country is null))
     and c.status in ('new', 'retry', 'callback')
     and (c.next_call_at is null or c.next_call_at <= now())
     and (c.claimed_by is null or c.claimed_by = auth.uid() or c.claimed_at <= now() - interval '15 minutes')
   order by case c.status when 'callback' then 0 when 'retry' then 1 else 2 end,
            case when c.status = 'new' then null else c.next_call_at end nulls last,
            l.created_at, l.id, c.position nulls last, c.created_at, c.id
   limit 1
   for update of c skip locked;
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
