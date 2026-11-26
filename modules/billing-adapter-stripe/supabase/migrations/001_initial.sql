-- Stripe adapter 1.0 · the Stripe side of billing, split out of billing 1.x.
--
--   * The webhook signing secret stays in Supabase Vault under the name
--     billing 1.x used (mod_billing_stripe_webhook_secret), so nothing moves;
--     these accessors are the adapter's own (billing's stay until a contract
--     release, for the previous release's code).
--   * The hourly check that registers the webhook endpoint through the Stripe
--     API now lives here, at the adapter's path. On its first run it moves the
--     endpoint from /api/mod/billing/stripe/webhook (billing 1.x) to
--     /api/mod/billing-adapter-stripe/webhook and disables the old one.
--
-- Every function refuses signed-in and anonymous callers (module SQL can't
-- GRANT/REVOKE). Reattach-friendly (or replace).

create or replace function public.mod_billing_adapter_stripe_webhook_secret()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_billing_adapter_stripe_webhook_secret: not allowed' using errcode = '42501';
  end if;
  return (
    select s.decrypted_secret from vault.decrypted_secrets s
    where s.name = 'mod_billing_stripe_webhook_secret'
  );
end;
$$;

create or replace function public.mod_billing_adapter_stripe_set_webhook_secret(_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _id uuid;
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_billing_adapter_stripe_set_webhook_secret: not allowed' using errcode = '42501';
  end if;
  select s.id into _id from vault.secrets s where s.name = 'mod_billing_stripe_webhook_secret';
  -- null clears it (module removal): an empty secret verifies nothing.
  if _secret is null then
    if _id is not null then
      perform vault.update_secret(_id, '');
    end if;
    return;
  end if;
  if _id is null then
    perform vault.create_secret(_secret, 'mod_billing_stripe_webhook_secret',
      'Stripe webhook signing secret (registered by billing-adapter-stripe)');
  else
    perform vault.update_secret(_id, _secret);
  end if;
end;
$$;

-- Hourly: connect (or move) the Stripe webhook endpoint; no-op once done.
select public.kit_register_app_schedule(
  'mod-billing-adapter-stripe-connect',
  '41 * * * *',
  '/api/mod/billing-adapter-stripe/cron/connect'
);
