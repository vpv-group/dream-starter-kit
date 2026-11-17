-- Teardown for `pnpm mod remove billing` (skipped with --keep-data).
drop table if exists public.mod_billing_subscriptions cascade;
drop table if exists public.mod_billing_prices cascade;
drop table if exists public.mod_billing_products cascade;
drop table if exists public.mod_billing_customers cascade;
