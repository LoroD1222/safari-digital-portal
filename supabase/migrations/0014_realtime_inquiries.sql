-- Live updates: the portal and admin hear about new inquiries without reloading.
-- Realtime respects the existing RLS policies, so clients only receive their own.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inquiries'
  ) then
    alter publication supabase_realtime add table public.inquiries;
  end if;
end $$;
