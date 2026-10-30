-- Sync Meta ad results every hour, using Supabase's scheduler (works on Vercel's free plan).
--
-- BEFORE RUNNING: replace PASTE_YOUR_CRON_SECRET_HERE below with the CRON_SECRET value
-- from Vercel → Settings → Environment Variables (the same one the daily job uses).
-- It's stored encrypted in Supabase Vault, not in the schedule itself.
-- Safe to run again (e.g. after changing the secret).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. The secret, encrypted.
do $$
begin
  if exists (select 1 from vault.secrets where name = 'portal_cron_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'portal_cron_secret'), 'PASTE_YOUR_CRON_SECRET_HERE');
  else
    perform vault.create_secret('PASTE_YOUR_CRON_SECRET_HERE', 'portal_cron_secret');
  end if;
end $$;

-- 2. Every hour at minute 7, call the portal's hourly sync.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'meta-hourly-sync') then
    perform cron.unschedule('meta-hourly-sync');
  end if;
end $$;

select cron.schedule('meta-hourly-sync', '7 * * * *', $job$
  select net.http_get(
    url := 'https://safari-digital-portal.vercel.app/api/cron/meta-hourly',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'portal_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
$job$);

-- Check it later with:
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content from net._http_response order by created desc limit 5;
