-- Onboarding "Add our team to your ad account": swap lovrokrizzz1@gmail.com for lovro0943@gmail.com
-- in the saved setting too (if Admin › Settings ever saved it, the saved value wins over the default).
update public.app_settings
   set value = replace(value, 'lovrokrizzz1@gmail.com', 'lovro0943@gmail.com')
 where key = 'meta_ad_emails' and value like '%lovrokrizzz1@gmail.com%';
