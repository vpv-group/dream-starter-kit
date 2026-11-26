-- Teardown for `pnpm mod remove billing` (skipped with --keep-data).
select public.kit_unregister_app_schedule('mod-billing-connect');
select public.kit_unregister_housekeeping('billing');
drop function if exists public.mod_billing_purge();
drop function if exists public.mod_billing_claim_webhook_event(text, text);
drop function if exists public.mod_billing_apply_subscription(jsonb, timestamptz);
drop function if exists public.mod_billing_user_id_by_email(text);
drop function if exists public.mod_billing_webhook_secret();
drop function if exists public.mod_billing_set_webhook_secret(text);
drop table if exists public.mod_billing_webhook_events cascade;
drop table if exists public.mod_billing_subscriptions cascade;
drop table if exists public.mod_billing_prices cascade;
drop table if exists public.mod_billing_products cascade;
drop table if exists public.mod_billing_customers cascade;
