-- Teardown for `pnpm mod remove billing` (skipped with --keep-data).
select public.kit_unregister_app_schedule('mod-billing-connect');
select public.kit_unregister_app_schedule('mod-billing-tags');
select public.kit_unregister_housekeeping('billing');
drop view if exists public.mod_billing_entitlements;
drop function if exists public.mod_billing_purge();
drop function if exists public.mod_billing_claim_webhook_event(text, text);
drop function if exists public.mod_billing_claim_event(text, text, text);
drop function if exists public.mod_billing_finish_event(text, text, boolean);
drop function if exists public.mod_billing_apply_subscription(jsonb, timestamptz);
drop function if exists public.mod_billing_user_id_by_email(text);
drop function if exists public.mod_billing_webhook_secret();
drop function if exists public.mod_billing_set_webhook_secret(text);
-- Billing-managed tags go with billing (the tags themselves stay: staff and
-- notification audiences may still use them).
drop table if exists public.mod_billing_managed_tags cascade;
drop table if exists public.mod_billing_webhook_events cascade;
drop table if exists public.mod_billing_customer_links cascade;
drop table if exists public.mod_billing_subscriptions cascade;
drop table if exists public.mod_billing_prices cascade;
drop table if exists public.mod_billing_products cascade;
drop table if exists public.mod_billing_customers cascade;
