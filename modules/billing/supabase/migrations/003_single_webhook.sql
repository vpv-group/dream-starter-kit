-- Billing 1.1 · one Stripe webhook, safe under retries and reordering.
--
-- The Stripe webhook moved from a Supabase edge function into the module's
-- public route (POST /api/mod/billing/stripe/webhook). This adds what makes a
-- webhook correct at scale:
--   * mod_billing_webhook_events — Stripe event ids already handled, so a
--     redelivered event is acknowledged without being applied twice;
--   * stripe_event_at on subscriptions + mod_billing_apply_subscription():
--     an OLDER event arriving after a newer one no longer rolls the
--     subscription back (Stripe doesn't guarantee delivery order);
--   * mod_billing_user_id_by_email(): an indexed lookup on profiles.email
--     instead of paging through every auth user per checkout;
--   * a retention purge for the event ledger (kit housekeeping).
-- Every function refuses signed-in and anonymous callers (module SQL can't
-- GRANT/REVOKE, so each checks its caller).
--
-- Reattach-friendly (if not exists / or replace).

create table if not exists public.mod_billing_webhook_events (
  id text primary key, -- Stripe event id (evt_…)
  type text not null,
  received_at timestamptz not null default now()
);
create index if not exists mod_billing_webhook_events_received_idx
  on public.mod_billing_webhook_events using brin (received_at);

-- Server-only ledger: RLS on, no policies (service role bypasses RLS).
alter table public.mod_billing_webhook_events enable row level security;

alter table public.mod_billing_subscriptions
  add column if not exists stripe_event_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Upsert one subscription row unless the stored row came from a NEWER event.
create or replace function public.mod_billing_apply_subscription(
  _row jsonb,
  _event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _applied boolean;
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_billing_apply_subscription: not allowed' using errcode = '42501';
  end if;
  -- The subscription may arrive before its price (Stripe doesn't order
  -- events, and prices created before the webhook existed never arrive): keep
  -- a stub so the foreign key holds; the price.* event fills it in.
  if _row ->> 'price_id' is not null then
    insert into public.mod_billing_prices (id, active)
    values (_row ->> 'price_id', true)
    on conflict (id) do nothing;
  end if;
  insert into public.mod_billing_subscriptions as s (
    id, user_id, price_id, status, quantity, cancel_at_period_end,
    current_period_end, stripe_event_at, updated_at
  )
  values (
    _row ->> 'id',
    (_row ->> 'user_id')::uuid,
    _row ->> 'price_id',
    _row ->> 'status',
    (_row ->> 'quantity')::integer,
    coalesce((_row ->> 'cancel_at_period_end')::boolean, false),
    (_row ->> 'current_period_end')::timestamptz,
    _event_at,
    now()
  )
  on conflict (id) do update
    set user_id = excluded.user_id,
        price_id = excluded.price_id,
        status = excluded.status,
        quantity = excluded.quantity,
        cancel_at_period_end = excluded.cancel_at_period_end,
        current_period_end = excluded.current_period_end,
        stripe_event_at = excluded.stripe_event_at,
        updated_at = now()
    where s.stripe_event_at is null
       or excluded.stripe_event_at is null
       or excluded.stripe_event_at >= s.stripe_event_at
  returning true into _applied;
  return coalesce(_applied, false);
end;
$$;

create or replace function public.mod_billing_user_id_by_email(_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_billing_user_id_by_email: not allowed' using errcode = '42501';
  end if;
  -- Served by profiles_email_lower_idx.
  return (
    select p.id from public.profiles p
    where lower(p.email) = lower(btrim(_email))
    order by p.created_at
    limit 1
  );
end;
$$;

-- Retention: the event ledger only needs to outlive Stripe's retry window.
select public.kit_register_retention('billing_webhook_events', 30, 'Handled Stripe event ids');

create or replace function public.mod_billing_purge()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _cutoff timestamptz := private.retention_cutoff('billing_webhook_events');
  _n integer;
begin
  if _cutoff is null then
    return 0;
  end if;
  delete from public.mod_billing_webhook_events e
  where e.id in (
    select x.id from public.mod_billing_webhook_events x
    where x.received_at < _cutoff
    limit 10000
  );
  get diagnostics _n = row_count;
  return _n;
end;
$$;

select public.kit_register_housekeeping('public.mod_billing_purge', 'billing');

-- The webhook endpoint's signing secret, when the module registered the
-- endpoint itself through the Stripe API (src/server/stripe/connect.ts).
-- Stored in Supabase Vault; STRIPE_WEBHOOK_SECRET in the env still wins.
create or replace function public.mod_billing_webhook_secret()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_billing_webhook_secret: not allowed' using errcode = '42501';
  end if;
  return (
    select s.decrypted_secret from vault.decrypted_secrets s
    where s.name = 'mod_billing_stripe_webhook_secret'
  );
end;
$$;

create or replace function public.mod_billing_set_webhook_secret(_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _id uuid;
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_billing_set_webhook_secret: not allowed' using errcode = '42501';
  end if;
  select s.id into _id from vault.secrets s where s.name = 'mod_billing_stripe_webhook_secret';
  if _id is null then
    perform vault.create_secret(_secret, 'mod_billing_stripe_webhook_secret',
      'Stripe webhook signing secret (registered by the billing module)');
  else
    perform vault.update_secret(_id, _secret);
  end if;
end;
$$;

-- Hourly: connect the Stripe webhook if it isn't yet (no-op afterwards).
select public.kit_register_app_schedule(
  'mod-billing-connect',
  '41 * * * *',
  '/api/mod/billing/cron/connect'
);
