-- The month a client's website was built, for the website income chart.
-- Separate from billing_start (when the monthly marketing price started).
alter table public.client_private add column if not exists website_built_on date;
