-- Safari Digital portal: new packages (October 2026).
-- Marketing: Growth ($450/mo), Scale ($750/mo), Marketing Partner (custom).
-- Website: Landing Page ($120), Tour Operator Website ($800), Advanced Website (custom).
-- Existing clients move to the closest new package: Starter/Core → Growth,
-- Elite → Scale, Full Build → Tour Operator Website.
-- Run once in Supabase → SQL Editor, after 0009_dataset_token.sql.

alter table public.clients drop constraint if exists clients_marketing_package_check;
alter table public.clients drop constraint if exists clients_website_package_check;

update public.clients set marketing_package = case marketing_package
  when 'starter' then 'growth' when 'core' then 'growth' when 'elite' then 'scale' else marketing_package end
  where marketing_package is not null;
update public.clients set website_package = 'tour_operator' where website_package = 'full_build';

alter table public.clients add constraint clients_marketing_package_check
  check (marketing_package in ('growth', 'scale', 'partner'));
alter table public.clients add constraint clients_website_package_check
  check (website_package in ('landing_page', 'tour_operator', 'advanced'));

-- Prices follow the package automatically; Safari Digital can give a discount.
-- monthly_fee keeps the final monthly price (what MRR adds up).
alter table public.client_private add column discount_type text not null default 'percent' check (discount_type in ('percent', 'amount'));
alter table public.client_private add column discount_value numeric(12, 2) not null default 0 check (discount_value >= 0);
-- Website: one-time fee after discount (not part of MRR).
alter table public.client_private add column website_fee numeric(12, 2) check (website_fee >= 0);
alter table public.client_private add column website_discount_type text not null default 'percent' check (website_discount_type in ('percent', 'amount'));
alter table public.client_private add column website_discount_value numeric(12, 2) not null default 0 check (website_discount_value >= 0);
