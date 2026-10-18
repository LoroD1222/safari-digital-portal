-- Safari Digital portal: inquiries form key, content approvals, ad reports,
-- requests, activity, website project and tutorials.
-- Run once in Supabase → SQL Editor, after 0004_integrations.sql.

-- ───────────────────────── More about each client ─────────────────────────
alter table public.clients
  add column plan_reels int check (plan_reels >= 0),
  add column plan_posts int check (plan_posts >= 0),
  add column website_stage text not null default 'info_received'
    check (website_stage in ('info_received', 'design', 'awaiting_approval', 'development', 'live')),
  add column website_preview_url text,
  add column design_review text check (design_review in ('pending', 'approved', 'changes_requested')),
  add column design_feedback text,
  add column meta_access_confirmed boolean not null default false,
  add column onboarding_note text,
  add column inquiry_form_key text unique;

-- Submitting again (after Safari Digital asked for more) clears the request.
create or replace function public.submit_onboarding() returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := public.my_client_id();
begin
  if cid is null then raise exception 'No client linked to this account'; end if;
  insert into public.onboarding_responses (client_id, submitted_at, updated_by)
  values (cid, now(), auth.uid())
  on conflict (client_id) do update set submitted_at = now(), updated_by = auth.uid();
  update public.clients set onboarding_status = 'submitted', onboarding_note = null
   where id = cid and onboarding_status in ('not_started', 'in_progress');
end;
$$;

-- The client approves the website design or asks for changes.
create function public.review_design(approve boolean, feedback text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := public.my_client_id();
begin
  if cid is null then raise exception 'No client linked to this account'; end if;
  update public.clients
     set design_review = case when approve then 'approved' else 'changes_requested' end,
         design_feedback = nullif(trim(feedback), ''),
         website_stage = case when approve then 'development' else website_stage end
   where id = cid and design_review = 'pending';
  if not found then raise exception 'There is no design waiting for review'; end if;
end;
$$;
revoke execute on function public.review_design(boolean, text) from public, anon;
grant execute on function public.review_design(boolean, text) to authenticated;

-- ───────────────────────── Content (Reels, posts) ─────────────────────────
create type public.content_status as enum ('draft', 'awaiting_approval', 'changes_requested', 'approved', 'scheduled', 'published');

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  caption text,
  kind text not null default 'reel' check (kind in ('reel', 'post', 'story')),
  platform text not null default 'both' check (platform in ('instagram', 'facebook', 'both')),
  status public.content_status not null default 'draft',
  scheduled_for date,
  published_at timestamptz,
  media_path text,
  media_type text,
  version int not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_items_client on public.content_items (client_id, created_at desc);

create function public.content_items_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = 'published' and old.status is distinct from 'published' then
    new.published_at = coalesce(new.published_at, now());
  elsif new.status <> 'published' then
    new.published_at = null;
  end if;
  return new;
end;
$$;
create trigger content_items_touch before update on public.content_items
  for each row execute function public.content_items_touch();

create table public.content_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_role public.user_role not null,
  kind text not null default 'comment' check (kind in ('comment', 'changes_requested', 'approved', 'revision', 'sent')),
  body text,
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index content_comments_item on public.content_comments (content_id, created_at);

alter table public.content_items enable row level security;
alter table public.content_comments enable row level security;
create policy "Admins manage content" on public.content_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients see their content once sent" on public.content_items
  for select to authenticated using (client_id = public.my_client_id() and status <> 'draft');
create policy "Admins manage content comments" on public.content_comments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients read comments on their content" on public.content_comments
  for select to authenticated using (exists (
    select 1 from public.content_items i
     where i.id = content_id and i.client_id = public.my_client_id() and i.status <> 'draft'));

-- The client approves a piece of content or asks for changes.
create function public.review_content(item_id uuid, approve boolean, comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v int;
begin
  update public.content_items
     set status = case when approve then 'approved'::public.content_status else 'changes_requested'::public.content_status end
   where id = item_id and client_id = public.my_client_id() and status = 'awaiting_approval'
   returning version into v;
  if not found then raise exception 'This content is not waiting for your approval'; end if;
  if not approve and nullif(trim(comment), '') is null then raise exception 'Tell us what to change'; end if;
  insert into public.content_comments (content_id, author_id, author_role, kind, body, version)
  values (item_id, auth.uid(), 'client', case when approve then 'approved' else 'changes_requested' end, nullif(trim(comment), ''), v);
end;
$$;
revoke execute on function public.review_content(uuid, boolean, text) from public, anon;
grant execute on function public.review_content(uuid, boolean, text) to authenticated;

-- Private bucket for Reels and images, one folder per client.
-- No size limit of its own: it follows your Supabase plan's upload limit.
insert into storage.buckets (id, name, public)
values ('content', 'content', false)
on conflict (id) do nothing;
create policy "Admins manage content files" on storage.objects
  for all to authenticated
  using (bucket_id = 'content' and public.is_admin())
  with check (bucket_id = 'content' and public.is_admin());
create policy "Clients see their content files" on storage.objects
  for select to authenticated
  using (bucket_id = 'content' and (storage.foldername(name))[1] = public.my_client_id()::text);

-- ───────────────────────── Monthly ad results ─────────────────────────
create table public.ad_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  meta_spend numeric(12, 2) not null default 0 check (meta_spend >= 0),
  meta_inquiries int not null default 0 check (meta_inquiries >= 0),
  campaigns jsonb not null default '[]'::jsonb,
  note text,
  source text not null default 'manual' check (source in ('manual', 'synced')),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);
create trigger ad_reports_updated_at before update on public.ad_reports
  for each row execute function public.set_updated_at();
alter table public.ad_reports enable row level security;
create policy "Admins manage ad reports" on public.ad_reports
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients read their ad reports" on public.ad_reports
  for select to authenticated using (client_id = public.my_client_id());

-- ───────────────────────── Requests (help and website changes) ─────────────────────────
create type public.request_status as enum ('submitted', 'in_progress', 'waiting_for_client', 'completed');

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  category text not null default 'support' check (category in ('website_change', 'support', 'problem')),
  subject text not null check (length(trim(subject)) > 0),
  status public.request_status not null default 'submitted',
  created_by uuid references auth.users (id) on delete set null,
  last_message_at timestamptz not null default now(),
  last_message_role public.user_role not null default 'client',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger requests_updated_at before update on public.requests
  for each row execute function public.set_updated_at();
create index requests_client on public.requests (client_id, last_message_at desc);

create table public.request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_role public.user_role not null,
  body text not null check (length(trim(body)) > 0),
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now()
);
create index request_messages_request on public.request_messages (request_id, created_at);

alter table public.requests enable row level security;
alter table public.request_messages enable row level security;
create policy "Admins manage requests" on public.requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients read their requests" on public.requests
  for select to authenticated using (client_id = public.my_client_id());
create policy "Admins manage request messages" on public.request_messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients read messages on their requests" on public.request_messages
  for select to authenticated using (exists (
    select 1 from public.requests r where r.id = request_id and r.client_id = public.my_client_id()));

-- A client opens a request (first message included).
create function public.create_request(category text, subject text, body text, attachment_path text, attachment_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := public.my_client_id();
  rid uuid;
begin
  if cid is null then raise exception 'No client linked to this account'; end if;
  if attachment_path is not null and split_part(attachment_path, '/', 1) <> cid::text then
    raise exception 'Attachment not allowed';
  end if;
  insert into public.requests (client_id, category, subject, created_by)
  values (cid, coalesce(nullif(category, ''), 'support'), trim(subject), auth.uid())
  returning id into rid;
  insert into public.request_messages (request_id, author_id, author_role, body, attachment_path, attachment_name)
  values (rid, auth.uid(), 'client', body, attachment_path, attachment_name);
  return rid;
end;
$$;

-- Either side replies. A client reply re-opens a request that was waiting
-- on them (or already completed).
create function public.reply_request(req_id uuid, body text, attachment_path text, attachment_name text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin boolean := public.is_admin();
  cid uuid;
begin
  select client_id into cid from public.requests where id = req_id;
  if cid is null or (not admin and cid is distinct from public.my_client_id()) then
    raise exception 'Request not found';
  end if;
  if attachment_path is not null and split_part(attachment_path, '/', 1) <> cid::text then
    raise exception 'Attachment not allowed';
  end if;
  insert into public.request_messages (request_id, author_id, author_role, body, attachment_path, attachment_name)
  values (req_id, auth.uid(), case when admin then 'admin'::public.user_role else 'client'::public.user_role end, body, attachment_path, attachment_name);
  update public.requests
     set last_message_at = now(),
         last_message_role = case when admin then 'admin'::public.user_role else 'client'::public.user_role end,
         status = case when not admin and status in ('waiting_for_client', 'completed') then 'in_progress'::public.request_status else status end
   where id = req_id;
end;
$$;
revoke execute on function public.create_request(text, text, text, text, text) from public, anon;
revoke execute on function public.reply_request(uuid, text, text, text) from public, anon;
grant execute on function public.create_request(text, text, text, text, text) to authenticated;
grant execute on function public.reply_request(uuid, text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('request-files', 'request-files', false, 20971520)
on conflict (id) do nothing;
create policy "Clients add request files to their folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'request-files' and (storage.foldername(name))[1] = public.my_client_id()::text);
create policy "Clients see their request files" on storage.objects
  for select to authenticated
  using (bucket_id = 'request-files' and (storage.foldername(name))[1] = public.my_client_id()::text);
create policy "Admins manage request files" on storage.objects
  for all to authenticated
  using (bucket_id = 'request-files' and public.is_admin())
  with check (bucket_id = 'request-files' and public.is_admin());

-- ───────────────────────── Activity (recent activity lists) ─────────────────────────
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  actor_role public.user_role not null,
  message text not null,
  client_link text,
  admin_link text,
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now()
);
create index activity_client on public.activity (client_id, created_at desc);
create index activity_recent on public.activity (created_at desc);
alter table public.activity enable row level security;
create policy "Admins manage activity" on public.activity
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients read their activity" on public.activity
  for select to authenticated using (client_id = public.my_client_id() and visible_to_client);

-- ───────────────────────── Tutorials (website how-to videos) ─────────────────────────
create table public.tutorials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  url text not null,
  topic text not null default 'website' check (topic in ('website', 'marketing')),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.tutorials enable row level security;
create policy "Signed-in people read tutorials" on public.tutorials
  for select to authenticated using (true);
create policy "Admins manage tutorials" on public.tutorials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
