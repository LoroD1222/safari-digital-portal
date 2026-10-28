-- Removes the demo data added by demo-betheli.sql and restores Betheli Expeditions'
-- original details. Run in Supabase → SQL Editor.
do $$
declare
  c uuid := '5f1a32b7-8991-4d5c-9427-8dcdde81016f';
  b jsonb;
begin
  delete from public.activity where client_id = c and id::text like 'dddd%';
  delete from public.request_messages where id::text like 'dddd%';
  delete from public.requests where client_id = c and id::text like 'dddd%';
  delete from public.inquiries where client_id = c and id::text like 'dddd%';
  delete from public.ad_reports where client_id = c and id::text like 'dddd%';
  delete from public.content_comments where id::text like 'dddd%';
  delete from public.content_items where client_id = c and id::text like 'dddd%';
  if to_regclass('public.invoices') is not null then
    delete from public.invoices where client_id = c and id::text like 'dddd%';
  end if;
  if to_regclass('public.meta_events') is not null then
    delete from public.meta_events where client_id = c and inquiry_id::text like 'dddd%';
  end if;

  select value::jsonb into b from public.app_settings where key = 'demo_backup_' || c;
  if b is not null then
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
    delete from public.app_settings where key = 'demo_backup_' || c;
  end if;
end $$;
