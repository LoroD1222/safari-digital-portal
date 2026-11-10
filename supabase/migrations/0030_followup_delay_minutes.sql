-- Safari Digital portal: follow-ups can wait minutes or hours, not only days.
-- delay_minutes set = wait that many minutes (days is then 0); empty = wait `days` days, as before.
-- Run once in Supabase → SQL Editor, after 0029_client_resend.sql.

alter table public.followup_rules add column if not exists delay_minutes integer;
alter table public.followup_rules drop constraint if exists followup_rules_days;
alter table public.followup_rules add constraint followup_rules_days check (
  (delay_minutes is null and days between 1 and 60) or (delay_minutes is not null and delay_minutes between 5 and 4320 and days = 0)
);
