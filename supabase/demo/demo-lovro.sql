-- DEMO DATA for the test account lovrokrizzz1@gmail.com
-- Fills the client this login belongs to with sample data for every portal feature.
-- First: Admin → Clients → Add client (e.g. "Safari Test Co"), then on that client's page
-- Portal access → add lovrokrizzz1@gmail.com. Then run this in Supabase → SQL Editor
-- (a new, empty query). Remove it again with remove-demo-lovro.sql.
-- Nothing here emails anyone or sends anything to Meta.

do $$
declare
  c uuid := (select client_id from public.profiles where lower(email) = 'lovrokrizzz1@gmail.com' and role = 'client');
  m0 date := date_trunc('month', now())::date;              -- this month
  m1 date := (date_trunc('month', now()) - interval '1 month')::date;
  m2 date := (date_trunc('month', now()) - interval '2 months')::date;
begin
  if c is null then
    raise exception 'lovrokrizzz1@gmail.com is not linked to a client yet. Add a client, then add this email under Portal access on its page.';
  end if;

  -- 0. Keep a copy of what we change, so the removal script can restore it.
  insert into public.app_settings (key, value)
  select 'demo_backup_' || c, jsonb_build_object(
    'client', (select to_jsonb(x) from (select contact_name, whatsapp, website_url, plan_reels, plan_posts, website_stage,
               website_preview_url, design_review, design_feedback, meta_access_confirmed, cms_url, onboarding_status, onboarding_note
               from public.clients where id = c) x),
    'onboarding', (select to_jsonb(o) from (select data, submitted_at from public.onboarding_responses where client_id = c) o)
  )::text
  on conflict (key) do nothing;

  -- 1. Client details and project status
  update public.clients set
    marketing_package = coalesce(marketing_package, 'growth'),
    website_package = coalesce(website_package, 'tour_operator'),
    account_status = 'active',
    contact_name = coalesce(contact_name, 'Lovro Krizan'),
    whatsapp = coalesce(whatsapp, '+255 754 210 334'),
    website_url = coalesce(website_url, 'https://safaritestco.com'),
    plan_reels = 4, plan_posts = 8,
    website_stage = 'awaiting_approval',
    website_preview_url = coalesce(website_preview_url, 'https://safaritestco.com'),
    design_review = 'pending', design_feedback = null,
    meta_access_confirmed = true,
    cms_url = coalesce(cms_url, 'https://safaritestco.sanity.studio'),
    onboarding_status = 'setup_complete', onboarding_note = null
  where id = c;

  -- 2. Onboarding answers (complete)
  insert into public.onboarding_responses (client_id, data, submitted_at)
  values (c, '{
    "business": {"contact_name": "Lovro Krizan", "whatsapp": "+255 754 210 334",
      "about": "Family-run safari company from Arusha. Small-group and private safaris with our own Land Cruisers and guides who have worked in the Serengeti for 15+ years.",
      "offers": ["Wildlife safaris", "Kilimanjaro treks", "Zanzibar holidays", "Cultural tours"],
      "markets": ["United States", "United Kingdom", "Germany", "Netherlands"],
      "inquiry_dest": "both", "inquiry_email": "bookings@safaritestco.com"},
    "marketing": {"facebook": "facebook.com/safaritestco", "instagram": "@safaritestco", "invite_sent": true,
      "budget": "600", "ad_goals": ["More inquiries", "More WhatsApp messages", "Reach new countries"],
      "promote": "7-day Serengeti & Ngorongoro migration safari, Kilimanjaro Machame route"},
    "website": {"current_site": "safaritestco.com", "domain_choice": "have", "domain": "safaritestco.com", "registrar": "Cloudflare",
      "goals": ["Get more direct inquiries", "Show our safari packages", "Be found on Google"],
      "pages": ["Home", "Safari packages", "Destinations", "About us", "Reviews", "Contact"],
      "likes": "Clean, big photos, easy inquiry form on every page"},
    "files": {"mode": "drive", "drive_link": "https://drive.google.com/drive/folders/demo-test", "drive_shared": true,
      "reviews": "https://www.tripadvisor.com/demo-test-expeditions"},
    "done": {"business": true, "ads": true, "website": true, "meta": true, "photos": true}
  }'::jsonb, now() - interval '40 days')
  on conflict (client_id) do update set data = excluded.data, submitted_at = excluded.submitted_at;

  -- 3. Content (Reels and posts): waiting for approval, changes asked, scheduled, published
  insert into public.content_items (id, client_id, title, caption, kind, platform, status, scheduled_for, published_at, version, created_at) values
    ('eeee0001-0000-4000-8000-000000000001', c, 'Great Migration river crossing', 'Thousands of wildebeest cross the Mara River 🐃 Ready to see it with your own eyes? Message us to plan your migration safari.', 'reel', 'both', 'awaiting_approval', m0 + 27, null, 1, now() - interval '1 day'),
    ('eeee0001-0000-4000-8000-000000000002', c, 'Meet our guide Daniel', '15 years in the Serengeti and still excited every morning. Meet Daniel, one of our lead guides.', 'post', 'instagram', 'awaiting_approval', m0 + 28, null, 1, now() - interval '20 hours'),
    ('eeee0001-0000-4000-8000-000000000003', c, 'Kilimanjaro summit sunrise', 'Uhuru Peak at 5,895 m. Every step is worth this view.', 'reel', 'both', 'changes_requested', m0 + 25, null, 2, now() - interval '4 days'),
    ('eeee0001-0000-4000-8000-000000000004', c, 'Ngorongoro Crater family safari', 'One crater, the Big Five, and memories for life. Family safaris from $2,450 per person.', 'post', 'facebook', 'scheduled', m0 + 29, null, 1, now() - interval '5 days'),
    ('eeee0001-0000-4000-8000-000000000005', c, 'Zanzibar beach after safari', 'Bush to beach: end your safari with 4 days on Zanzibar''s white sand.', 'post', 'both', 'approved', m0 + 30, null, 1, now() - interval '3 days'),
    ('eeee0001-0000-4000-8000-000000000006', c, 'Leopard in the acacia tree', 'Patience pays off. Spotted near Seronera this week 🐆', 'reel', 'both', 'published', null, m0 + interval '3 days 18 hours', 1, m0 + interval '1 day'),
    ('eeee0001-0000-4000-8000-000000000007', c, 'Guest review: The Smith family', '"Best holiday of our lives." Thank you, Smith family from Texas!', 'post', 'both', 'published', null, m0 + interval '7 days 18 hours', 1, m0 + interval '5 days'),
    ('eeee0001-0000-4000-8000-000000000008', c, 'Morning game drive', 'What a 6 am game drive looks like in the Serengeti.', 'reel', 'instagram', 'published', null, m0 + interval '11 days 18 hours', 1, m0 + interval '9 days'),
    ('eeee0001-0000-4000-8000-000000000009', c, 'Tarangire elephants', 'Tarangire has more elephants than anywhere else in northern Tanzania 🐘', 'post', 'both', 'published', null, m0 + interval '14 days 18 hours', 1, m0 + interval '12 days'),
    ('eeee0001-0000-4000-8000-000000000010', c, '3 things to pack for a safari', 'Neutral colours, a good hat, and binoculars. Save this for your trip!', 'post', 'both', 'published', null, m0 + interval '18 days 18 hours', 1, m0 + interval '16 days'),
    ('eeee0001-0000-4000-8000-000000000011', c, 'Lion pride at sunset', 'Golden hour in the Serengeti 🦁', 'reel', 'both', 'published', null, m0 + interval '21 days 18 hours', 1, m0 + interval '19 days'),
    ('eeee0001-0000-4000-8000-000000000012', c, 'Cultural visit to a Maasai village', 'Learn how the Maasai have lived alongside wildlife for centuries.', 'post', 'facebook', 'published', null, m1 + interval '4 days 18 hours', 1, m1 + interval '2 days'),
    ('eeee0001-0000-4000-8000-000000000013', c, 'Hot air balloon over the Serengeti', 'Champagne breakfast after the flight? Yes please 🎈', 'reel', 'both', 'published', null, m1 + interval '9 days 18 hours', 1, m1 + interval '7 days'),
    ('eeee0001-0000-4000-8000-000000000014', c, 'Why choose a private safari', 'Your schedule, your guide, your pace.', 'post', 'both', 'published', null, m1 + interval '15 days 18 hours', 1, m1 + interval '13 days'),
    ('eeee0001-0000-4000-8000-000000000015', c, 'Kilimanjaro Machame route in 60 seconds', '7 days, 5 climate zones, 1 summit.', 'reel', 'both', 'published', null, m1 + interval '22 days 18 hours', 1, m1 + interval '20 days')
  on conflict (id) do nothing;

  insert into public.content_comments (id, content_id, author_role, kind, body, version, created_at) values
    ('eeee0002-0000-4000-8000-000000000001', 'eeee0001-0000-4000-8000-000000000003', 'client', 'changes_requested', 'Please use the photo with our guide holding the Betheli flag at the summit, and mention the Machame route in the caption.', 1, now() - interval '3 days'),
    ('eeee0002-0000-4000-8000-000000000002', 'eeee0001-0000-4000-8000-000000000003', 'admin', 'revision', 'Updated with the flag photo and Machame route. Ready for another look!', 2, now() - interval '2 days'),
    ('eeee0002-0000-4000-8000-000000000003', 'eeee0001-0000-4000-8000-000000000005', 'client', 'approved', 'Love it, approved!', 1, now() - interval '2 days'),
    ('eeee0002-0000-4000-8000-000000000004', 'eeee0001-0000-4000-8000-000000000004', 'client', 'approved', null, 1, now() - interval '4 days')
  on conflict (id) do nothing;

  -- 4. Advertising results (last 3 months), with form leads and chats per campaign
  insert into public.ad_reports (id, client_id, month, meta_spend, meta_inquiries, campaigns, note, source) values
    ('eeee0003-0000-4000-8000-000000000001', c, m2, 480, 31, '[
      {"name":"Migration safari · US & UK","status":"ended","spend":290,"inquiries":19,"leads":7,"chats":12},
      {"name":"Kilimanjaro treks · Germany","status":"ended","spend":190,"inquiries":12,"leads":5,"chats":7}]'::jsonb, null, 'manual'),
    ('eeee0003-0000-4000-8000-000000000002', c, m1, 560, 42, '[
      {"name":"Migration safari · US & UK","status":"active","spend":310,"inquiries":24,"leads":9,"chats":15},
      {"name":"Kilimanjaro treks · Germany","status":"active","spend":170,"inquiries":11,"leads":4,"chats":7},
      {"name":"Retargeting · website visitors","status":"active","spend":80,"inquiries":7,"leads":3,"chats":4}]'::jsonb,
      'Best month so far. WhatsApp ads are doing really well in the UK.', 'manual'),
    ('eeee0003-0000-4000-8000-000000000003', c, m0, 410, 33, '[
      {"name":"Migration safari · US & UK","status":"active","spend":230,"inquiries":18,"leads":6,"chats":12},
      {"name":"Family safaris · Netherlands","status":"active","spend":120,"inquiries":10,"leads":4,"chats":6},
      {"name":"Retargeting · website visitors","status":"paused","spend":60,"inquiries":5,"leads":2,"chats":3}]'::jsonb, null, 'manual')
  on conflict (client_id, month) do nothing;

  -- 5. Inquiries (this month and last month), from every source
  insert into public.inquiries (id, client_id, customer_name, email, phone, country, interested_in, travel_dates, travellers, message, source, campaign, channel, status, received_at, origin) values
    ('eeee0004-0000-4000-8000-000000000001', c, 'Emily Carter', 'emily.carter@example.com', '+1 512 555 0142', 'United States', '7-day Serengeti migration safari', 'July 2027', '2 adults', 'We would love to see the river crossing. Is July a good time?', 'meta_ads', 'Migration safari · US & UK', 'website_form', 'new', now() - interval '3 hours', 'website_form'),
    ('eeee0004-0000-4000-8000-000000000002', c, 'Thomas Becker', null, '+49 151 2345 6789', 'Germany', 'Kilimanjaro Machame route', 'February 2027', '2 adults', 'Climbing for our 10th anniversary.', 'meta_ads', 'Kilimanjaro treks · Germany', 'whatsapp', 'new', now() - interval '9 hours', 'manual'),
    ('eeee0004-0000-4000-8000-000000000003', c, 'Sophie de Vries', 'sophie.devries@example.com', null, 'Netherlands', 'Family safari + Zanzibar', 'Summer 2027', '2 adults, 2 children', 'Kids are 8 and 11. Do you have family rooms?', 'meta_ads', 'Family safaris · Netherlands', 'instagram_message', 'contacted', now() - interval '1 day 4 hours', 'manual'),
    ('eeee0004-0000-4000-8000-000000000004', c, 'James Whitfield', 'j.whitfield@example.com', '+44 7700 900123', 'United Kingdom', 'Private 5-day safari', 'March 2027', '2 adults', null, 'website', null, 'website_form', 'contacted', now() - interval '2 days', 'website_form'),
    ('eeee0004-0000-4000-8000-000000000005', c, 'Maria Rossi', 'maria.rossi@example.com', '+39 333 123 4567', 'Italy', 'Honeymoon safari', 'June 2027', '2 adults', 'Our honeymoon! Something special please.', 'meta_organic', null, 'instagram_message', 'booked', now() - interval '4 days', 'manual'),
    ('eeee0004-0000-4000-8000-000000000006', c, 'David Kim', 'david.kim@example.com', null, 'United States', 'Serengeti + Ngorongoro', 'August 2027', '4 adults', null, 'meta_ads', 'Migration safari · US & UK', 'website_form', 'booked', now() - interval '6 days', 'website_form'),
    ('eeee0004-0000-4000-8000-000000000007', c, 'Anna Schmidt', null, '+49 170 9876 543', 'Germany', 'Kilimanjaro Lemosho route', 'January 2027', '1 adult', null, 'meta_ads', 'Kilimanjaro treks · Germany', 'whatsapp', 'contacted', now() - interval '7 days', 'manual'),
    ('eeee0004-0000-4000-8000-000000000008', c, 'Olivia Brown', 'olivia.b@example.com', '+44 7911 123456', 'United Kingdom', 'Tarangire & Ngorongoro', 'December 2026', '2 adults, 1 child', null, 'website', null, 'website_form', 'closed', now() - interval '9 days', 'website_form'),
    ('eeee0004-0000-4000-8000-000000000009', c, 'Peter Jansen', 'peter.jansen@example.com', null, 'Netherlands', '10-day Tanzania highlights', 'October 2027', '2 adults', null, 'meta_ads', 'Family safaris · Netherlands', 'facebook_message', 'new', now() - interval '10 days', 'manual'),
    ('eeee0004-0000-4000-8000-000000000010', c, 'Grace Wanjiru', null, '+254 712 345 678', 'Kenya', 'Zanzibar beach week', 'December 2026', '3 adults', null, 'direct', null, 'whatsapp', 'booked', now() - interval '12 days', 'manual'),
    ('eeee0004-0000-4000-8000-000000000011', c, 'Michael O''Brien', 'mobrien@example.com', null, 'Ireland', 'Migration safari', 'September 2027', '2 adults', null, 'meta_ads', 'Migration safari · US & UK', 'website_form', 'contacted', now() - interval '14 days', 'website_form'),
    ('eeee0004-0000-4000-8000-000000000012', c, 'Laura Martin', 'laura.martin@example.com', null, 'France', 'Cultural tour + safari', 'April 2027', '2 adults', null, 'unknown', null, 'email', 'closed', now() - interval '17 days', 'manual'),
    ('eeee0004-0000-4000-8000-000000000013', c, 'Robert Hughes', null, '+1 917 555 0199', 'United States', 'Kilimanjaro + safari combo', 'June 2027', '2 adults', null, 'meta_ads', 'Retargeting · website visitors', 'whatsapp', 'booked', now() - interval '19 days', 'manual'),
    ('eeee0004-0000-4000-8000-000000000014', c, 'Hannah Müller', 'hannah.m@example.com', null, 'Germany', 'Serengeti 4 days', 'November 2026', '2 adults', null, 'website', null, 'website_form', 'contacted', now() - interval '22 days', 'website_form'),
    ('eeee0004-0000-4000-8000-000000000015', c, 'Chris Taylor', 'chris.taylor@example.com', '+61 412 345 678', 'Australia', 'Private photography safari', 'July 2027', '1 adult', null, 'meta_organic', null, 'facebook_message', 'new', now() - interval '25 days', 'manual'),
    ('eeee0004-0000-4000-8000-000000000016', c, 'Ella Johansson', 'ella.j@example.com', null, 'Sweden', 'Family safari', 'Summer 2027', '2 adults, 2 children', null, 'meta_ads', 'Migration safari · US & UK', 'website_form', 'booked', now() - interval '29 days', 'website_form'),
    ('eeee0004-0000-4000-8000-000000000017', c, 'Daniel Smith', 'dan.smith@example.com', '+1 214 555 0177', 'United States', 'Migration safari', 'August 2027', '5 adults', null, 'meta_ads', 'Migration safari · US & UK', 'whatsapp', 'booked', now() - interval '33 days', 'manual'),
    ('eeee0004-0000-4000-8000-000000000018', c, 'Isabel García', 'isabel.g@example.com', null, 'Spain', 'Honeymoon + Zanzibar', 'May 2027', '2 adults', null, 'website', null, 'website_form', 'closed', now() - interval '37 days', 'website_form'),
    ('eeee0004-0000-4000-8000-000000000019', c, 'Lukas Weber', null, '+49 160 1122 334', 'Germany', 'Kilimanjaro Machame route', 'January 2027', '3 adults', null, 'meta_ads', 'Kilimanjaro treks · Germany', 'whatsapp', 'contacted', now() - interval '41 days', 'manual'),
    ('eeee0004-0000-4000-8000-000000000020', c, 'Sarah Thompson', 'sarah.t@example.com', null, 'United Kingdom', 'Serengeti + Ngorongoro', 'March 2027', '2 adults', null, 'meta_ads', 'Migration safari · US & UK', 'instagram_message', 'booked', now() - interval '45 days', 'manual')
  on conflict (id) do nothing;

  -- 6. Requests (website changes / help) with a conversation
  insert into public.requests (id, client_id, category, subject, status, last_message_at, last_message_role, created_at) values
    ('eeee0005-0000-4000-8000-000000000001', c, 'website_change', 'Add the new 2027 migration safari prices', 'in_progress', now() - interval '1 day', 'admin', now() - interval '3 days'),
    ('eeee0005-0000-4000-8000-000000000002', c, 'support', 'Can we run ads for the Christmas Zanzibar offer?', 'waiting_for_client', now() - interval '2 days', 'admin', now() - interval '5 days'),
    ('eeee0005-0000-4000-8000-000000000003', c, 'problem', 'Contact form was not sending to our email', 'completed', now() - interval '12 days', 'admin', now() - interval '14 days')
  on conflict (id) do nothing;
  insert into public.request_messages (id, request_id, author_role, body, created_at) values
    ('eeee0006-0000-4000-8000-000000000001', 'eeee0005-0000-4000-8000-000000000001', 'client', 'Hi! Please update the 7-day migration safari to $3,250 per person for 2027 and add a note that kids under 12 get 30% off.', now() - interval '3 days'),
    ('eeee0006-0000-4000-8000-000000000002', 'eeee0005-0000-4000-8000-000000000001', 'admin', 'Got it! We''re updating the package page now and will let you know when it''s live.', now() - interval '1 day'),
    ('eeee0006-0000-4000-8000-000000000003', 'eeee0005-0000-4000-8000-000000000002', 'client', 'We have a 5-night Zanzibar Christmas offer at $1,190 per person. Can we promote it?', now() - interval '5 days'),
    ('eeee0006-0000-4000-8000-000000000004', 'eeee0005-0000-4000-8000-000000000002', 'admin', 'Yes! Could you send 5–10 photos of the hotel and the exact dates? We''ll have the ad ready in 2 days.', now() - interval '2 days'),
    ('eeee0006-0000-4000-8000-000000000005', 'eeee0005-0000-4000-8000-000000000003', 'client', 'A guest said they filled in the contact form but we never got it.', now() - interval '14 days'),
    ('eeee0006-0000-4000-8000-000000000006', 'eeee0005-0000-4000-8000-000000000003', 'admin', 'Fixed: the form now sends to bookings@safaritestco.com and every inquiry also appears in your portal under Inquiries.', now() - interval '12 days')
  on conflict (id) do nothing;

  -- 7. Invoices: two paid months, this month unpaid, website deposit paid
  if to_regclass('public.invoices') is not null then
    insert into public.invoices (id, client_id, number, kind, period_month, status, currency, issue_date, due_date, items, total, sent_at, paid_at, payment_method, payment_ref) values
      ('eeee0007-0000-4000-8000-000000000001', c, 'SD-TEST-001', 'one_off', null, 'paid', 'USD', m2 + 2, m2 + 16,
        '[{"description":"Tour Operator Website · design and build (50% deposit)","details":"Up to 6 pages and 5 safari itineraries, CMS, SEO, Meta Pixel and analytics","amount":400}]'::jsonb, 400, (m2 + 2)::timestamptz, m2 + 6, 'M-Pesa', 'QJ81DEMO2A'),
      ('eeee0007-0000-4000-8000-000000000002', c, 'SD-TEST-002', 'monthly', m1, 'paid', 'USD', m1, m1 + 14,
        '[{"description":"Growth Marketing · monthly management","details":"Facebook & Instagram ads, 4 ad creatives, monthly report","amount":450},{"description":"Discount (agreed rate)","amount":-250}]'::jsonb, 200, m1::timestamptz, m1 + 9, 'M-Pesa', 'QK19DEMO7B'),
      ('eeee0007-0000-4000-8000-000000000003', c, 'SD-TEST-003', 'monthly', m0, 'sent', 'USD', m0, m0 + 14,
        '[{"description":"Growth Marketing · monthly management","details":"Facebook & Instagram ads, 4 ad creatives, monthly report","amount":450},{"description":"Discount (agreed rate)","amount":-250}]'::jsonb, 200, m0::timestamptz, null, null, null)
    on conflict (id) do nothing;
  end if;

  -- 8. Activity feed
  insert into public.activity (id, client_id, actor_role, message, client_link, admin_link, created_at) values
    ('eeee0008-0000-4000-8000-000000000001', c, 'admin', 'New Reel ready for your approval: Great Migration river crossing', '/portal/marketing', '/admin/content', now() - interval '1 day'),
    ('eeee0008-0000-4000-8000-000000000002', c, 'admin', 'New post ready for your approval: Meet our guide Daniel', '/portal/marketing', '/admin/content', now() - interval '20 hours'),
    ('eeee0008-0000-4000-8000-000000000003', c, 'client', 'Asked for changes: Kilimanjaro summit sunrise', '/portal/marketing', '/admin/content', now() - interval '3 days'),
    ('eeee0008-0000-4000-8000-000000000004', c, 'client', 'Approved: Zanzibar beach after safari', '/portal/marketing', '/admin/content', now() - interval '2 days'),
    ('eeee0008-0000-4000-8000-000000000005', c, 'admin', 'Your website design is ready to review', '/portal/website', null, now() - interval '2 days'),
    ('eeee0008-0000-4000-8000-000000000006', c, 'client', 'New website inquiry from Emily Carter', '/portal/inquiries', '/admin/inquiries', now() - interval '3 hours'),
    ('eeee0008-0000-4000-8000-000000000007', c, 'admin', 'Advertising results updated', '/portal/marketing/advertising', null, now() - interval '4 days'),
    ('eeee0008-0000-4000-8000-000000000008', c, 'admin', 'Payment received for invoice SD-TEST-002', '/portal/account#billing', '/admin/invoices', m1 + interval '9 days'),
    ('eeee0008-0000-4000-8000-000000000009', c, 'admin', 'Invoice SD-TEST-003 sent ($200)', '/portal/account#billing', '/admin/invoices', m0::timestamptz)
  on conflict (id) do nothing;
end $$;
