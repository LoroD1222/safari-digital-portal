-- Safari Digital portal: settings the admin can change in the app
-- (tutorial videos, Meta Business ID, Drive share email).
-- Run once in Supabase → SQL Editor, after 0002_onboarding.sql.

create table public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
create policy "Signed-in people read settings" on public.app_settings
  for select to authenticated using (true);
create policy "Admins change settings" on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tutorial videos uploaded by the admin. Public so they play for clients
-- without extra sign-in steps; only admins can add or remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutorials', 'tutorials', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy "Admins manage tutorial videos" on storage.objects
  for all to authenticated
  using (bucket_id = 'tutorials' and public.is_admin())
  with check (bucket_id = 'tutorials' and public.is_admin());
