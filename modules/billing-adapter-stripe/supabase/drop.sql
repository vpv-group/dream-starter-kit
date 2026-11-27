-- Teardown for `pnpm mod remove billing-adapter-stripe` (skipped with --keep-data).
-- Billing's purchase ledger stays (it belongs to billing); only the Stripe
-- wiring goes, including the webhook signing secret.
select public.kit_unregister_app_schedule('mod-billing-adapter-stripe-connect');
select public.mod_billing_adapter_stripe_set_webhook_secret(null);
drop function if exists public.mod_billing_adapter_stripe_webhook_secret();
drop function if exists public.mod_billing_adapter_stripe_set_webhook_secret(text);
