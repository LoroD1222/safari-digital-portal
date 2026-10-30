-- Removes ALL sample data added by demo-betheli.sql and demo-lovro.sql (ids starting
-- dddd… and eeee…), from every client, and restores the clients' original details.
-- Real data is never touched. Safe to run more than once.
-- Run in Supabase → SQL Editor → New query.
do $$
declare
  t text;
  k record;
  b jsonb;
  c uuid;
begin
  -- 1. Demo rows (children first). Only tables that exist are touched.
  if to_regclass('public.meta_events') is not null then
    delete from public.meta_events where inquiry_id::text like 'dddd%' or inquiry_id::text like 'eeee%';
  end if;
  if to_regclass('public.inquiry_history') is not null then
    delete from public.inquiry_history where inquiry_id::text like 'dddd%' or inquiry_id::text like 'eeee%';
  end if;
  foreach t in array array['activity', 'request_messages', 'requests', 'inquiries', 'ad_reports',
                           'content_comments', 'content_items', 'invoices'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where id::text like %L or id::text like %L', t, 'dddd%', 'eeee%');
    end if;
  end loop;

  -- 2. Put back each demo client's original details (saved when the demo was added).
  for k in select key, value from public.app_settings where key like 'demo_backup_%' loop
    b := k.value::jsonb;
    c := substring(k.key from 13)::uuid;
    update public.clients set
      contact_name = b->'client'->>'contact_name', whatsapp = b->'client'->>'whatsapp', website_url = b->'client'->>'website_url',
      plan_reels = (b->'client'->>'plan_reels')::int, plan_posts = (b->'client'->>'plan_posts')::int,
      website_stage = coalesce(b->'client'->>'website_stage', 'info_received'), website_preview_url = b->'client'->>'website_preview_url',
      design_review = b->'client'->>'design_review', design_feedback = b->'client'->>'design_feedback',
      meta_access_confirmed = coalesce((b->'client'->>'meta_access_confirmed')::boolean, false), cms_url = b->'client'->>'cms_url',
      onboarding_status = coalesce(b->'client'->>'onboarding_status', 'not_started')::public.onboarding_status, onboarding_note = b->'client'->>'onboarding_note'
    where id = c;
    if b->'onboarding' is null or b->'onboarding' = 'null'::jsonb then
      delete from public.onboarding_responses where client_id = c;
    else
      update public.onboarding_responses set data = b->'onboarding'->'data', submitted_at = (b->'onboarding'->>'submitted_at')::timestamptz where client_id = c;
    end if;
    delete from public.app_settings where key = k.key;
  end loop;

  raise notice 'Sample data removed.';
end $$;
