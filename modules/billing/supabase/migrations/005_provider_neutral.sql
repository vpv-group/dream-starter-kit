-- Billing 2.0 · provider-neutral billing core.
--
-- Billing used to be Stripe through and through. It is now a core that any
-- payment provider plugs into through an adapter module (Stripe today via
-- billing-adapter-stripe; an in-app purchase provider such as RevenueCat
-- later). One user may hold purchases from several providers at once, so the
-- ledger gains a `provider` everywhere and entitlements are read from one
-- view, whatever sold them:
--
--   * `provider` on customers/products/prices/subscriptions/webhook events
--     (existing rows are Stripe's);
--   * mod_billing_customer_links: one customer id per (user, provider) — the
--     old mod_billing_customers allows one per user, so it stays as Stripe's
--     legacy mirror until a later contract release;
--   * subscriptions gain what entitlements and tags need regardless of
--     provider: kind (subscription | one_time), plan_id (the Payload plan),
--     entitlement, store (web | app_store | play_store | promotional),
--     environment, provider_event_at (the ordering guard, provider-neutral);
--   * mod_billing_entitlements: the active rows, read under the caller's RLS
--     (security_invoker) — usePremium, the server entitlement check and the
--     paywall all read it;
--   * mod_billing_managed_tags: which public.tags billing keeps in sync (plan,
--     status, billing cycle, store) so reconciling never touches staff tags;
--   * mod_billing_claim_event(): the webhook claim, per provider;
--   * the hourly webhook check moves to the Stripe adapter (it registers its
--     own schedule); a daily billing-tags sweep is added.
--
-- Expand-only: every column is nullable or defaulted, the old functions keep
-- their signatures (the previous release's code still calls them), and the
-- Stripe-named columns stay until a later `-- dream:contract` release.
-- Reattach-friendly (if not exists / or replace).

alter table public.mod_billing_customers
  add column if not exists provider text not null default 'stripe';
alter table public.mod_billing_products
  add column if not exists provider text not null default 'stripe';
alter table public.mod_billing_prices
  add column if not exists provider text not null default 'stripe';
alter table public.mod_billing_webhook_events
  add column if not exists provider text not null default 'stripe';

alter table public.mod_billing_subscriptions
  add column if not exists provider text not null default 'stripe',
  add column if not exists kind text not null default 'subscription'
    check (kind in ('subscription', 'one_time')),
  add column if not exists plan_id text,
  add column if not exists entitlement text not null default 'premium'
    check (entitlement in ('members', 'premium')),
  add column if not exists store text not null default 'web'
    check (store in ('web', 'app_store', 'play_store', 'promotional')),
  add column if not exists environment text
    check (environment in ('live', 'test', 'sandbox')),
  add column if not exists provider_event_at timestamptz;

-- Lifetime purchases were written as an active row keyed by the Checkout
-- Session id (cs_…).
update public.mod_billing_subscriptions
  set kind = 'one_time'
  where id like 'cs\_%' and kind = 'subscription';
update public.mod_billing_subscriptions
  set provider_event_at = stripe_event_at
  where provider_event_at is null and stripe_event_at is not null;

create index if not exists mod_billing_subscriptions_user_status_idx
  on public.mod_billing_subscriptions (user_id, status);

-- One provider customer per (user, provider).
create table if not exists public.mod_billing_customer_links (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  -- The wallet / checkout email when it differs from the account email.
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider),
  unique (provider, provider_customer_id)
);

alter table public.mod_billing_customer_links enable row level security;

drop policy if exists "mod_billing_customer_links: select own"
  on public.mod_billing_customer_links;
create policy "mod_billing_customer_links: select own"
  on public.mod_billing_customer_links for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.mod_billing_customer_links
  (user_id, provider, provider_customer_id, billing_email, created_at)
select c.user_id, 'stripe', c.stripe_customer_id, c.billing_email, c.created_at
from public.mod_billing_customers c
on conflict do nothing;

-- Active entitlements, whatever sold them. security_invoker: the caller's
-- RLS on mod_billing_subscriptions applies (read-own).
create or replace view public.mod_billing_entitlements
  with (security_invoker = true)
as
select
  s.user_id,
  s.entitlement,
  s.provider,
  s.store,
  s.kind,
  s.status,
  s.id as subscription_id,
  s.price_id,
  s.plan_id,
  s.cancel_at_period_end,
  s.current_period_end as expires_at
from public.mod_billing_subscriptions s
where s.status in ('active', 'trialing');

-- Tags billing keeps in sync (see src/server/core/tags.ts). Server-only.
create table if not exists public.mod_billing_managed_tags (
  tag_id uuid primary key references public.tags (id) on delete cascade,
  tag_group text not null
    check (tag_group in ('plan', 'status', 'cycle', 'store')),
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.mod_billing_managed_tags enable row level security;

-- Adopt the tags billing wrote before 2.0: "Free" (signup) and plan names
-- (Stripe product names), so the sync can remove them when they go stale.
insert into public.mod_billing_managed_tags (tag_id, tag_group, value)
select t.id, 'status', 'free'
from public.tags t
where t.name = 'Free' and t.is_system
on conflict (tag_id) do nothing;
insert into public.mod_billing_managed_tags (tag_id, tag_group, value)
select t.id, 'plan', t.name
from public.tags t
join public.mod_billing_products p on p.name = t.name
where t.is_system
on conflict (tag_id) do nothing;

-- Same body as 003's, extended with the 2.0 columns (all optional in _row,
-- so the previous release's callers keep working) and the provider-neutral
-- ordering stamp.
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
  _provider text := coalesce(_row ->> 'provider', 'stripe');
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_billing_apply_subscription: not allowed' using errcode = '42501';
  end if;
  -- The subscription may arrive before its price (providers don't order
  -- events): keep a stub so the foreign key holds; the catalog sync fills it.
  if _row ->> 'price_id' is not null then
    insert into public.mod_billing_prices (id, active, provider)
    values (_row ->> 'price_id', true, _provider)
    on conflict (id) do nothing;
  end if;
  insert into public.mod_billing_subscriptions as s (
    id, user_id, price_id, status, quantity, cancel_at_period_end,
    current_period_end, stripe_event_at, provider_event_at, updated_at,
    provider, kind, plan_id, entitlement, store, environment
  )
  values (
    _row ->> 'id',
    (_row ->> 'user_id')::uuid,
    _row ->> 'price_id',
    _row ->> 'status',
    (_row ->> 'quantity')::integer,
    coalesce((_row ->> 'cancel_at_period_end')::boolean, false),
    (_row ->> 'current_period_end')::timestamptz,
    case when _provider = 'stripe' then _event_at end,
    _event_at,
    now(),
    _provider,
    coalesce(_row ->> 'kind', 'subscription'),
    _row ->> 'plan_id',
    coalesce(_row ->> 'entitlement', 'premium'),
    coalesce(_row ->> 'store', 'web'),
    _row ->> 'environment'
  )
  on conflict (id) do update
    set user_id = excluded.user_id,
        price_id = excluded.price_id,
        status = excluded.status,
        quantity = excluded.quantity,
        cancel_at_period_end = excluded.cancel_at_period_end,
        current_period_end = excluded.current_period_end,
        stripe_event_at = excluded.stripe_event_at,
        provider_event_at = excluded.provider_event_at,
        provider = excluded.provider,
        kind = excluded.kind,
        plan_id = coalesce(excluded.plan_id, s.plan_id),
        entitlement = excluded.entitlement,
        store = excluded.store,
        environment = coalesce(excluded.environment, s.environment),
        updated_at = now()
    where coalesce(s.provider_event_at, s.stripe_event_at) is null
       or excluded.provider_event_at is null
       or excluded.provider_event_at >= coalesce(s.provider_event_at, s.stripe_event_at)
  returning true into _applied;
  return coalesce(_applied, false);
end;
$$;

-- The webhook claim, per provider (see 004 for the semantics). Stripe event
-- ids stay bare (evt_…), so a delivery claimed by the previous release is
-- still recognized; other providers' ids are stored as "<provider>:<id>".
create or replace function public.mod_billing_claim_event(
  _provider text,
  _id text,
  _type text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _key text := case when _provider = 'stripe' then _id else _provider || ':' || _id end;
  _status text;
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_billing_claim_event: not allowed' using errcode = '42501';
  end if;
  for _i in 1..2 loop
    insert into public.mod_billing_webhook_events (id, type, status, claimed_at, provider)
    values (_key, _type, 'processing', now(), _provider)
    on conflict (id) do nothing;
    if found then
      return 'claimed';
    end if;

    update public.mod_billing_webhook_events e
      set claimed_at = now(), received_at = now()
    where e.id = _key
      and e.status = 'processing'
      and (e.claimed_at is null or e.claimed_at < now() - interval '5 minutes');
    if found then
      return 'claimed';
    end if;

    select e.status into _status
    from public.mod_billing_webhook_events e
    where e.id = _key;
    if _status = 'done' then
      return 'duplicate';
    end if;
    if _status = 'processing' then
      return 'busy';
    end if;
  end loop;
  return 'busy';
end;
$$;

-- Finish a claim: 'done' after the side effects ran, or released (deleted)
-- so the provider's retry can run them.
create or replace function public.mod_billing_finish_event(
  _provider text,
  _id text,
  _ok boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _key text := case when _provider = 'stripe' then _id else _provider || ':' || _id end;
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_billing_finish_event: not allowed' using errcode = '42501';
  end if;
  if _ok then
    update public.mod_billing_webhook_events set status = 'done' where id = _key;
  else
    delete from public.mod_billing_webhook_events
    where id = _key and status = 'processing';
  end if;
end;
$$;

-- The Stripe adapter registers its own hourly webhook check
-- (mod-billing-adapter-stripe-connect); billing's old one goes.
select public.kit_unregister_app_schedule('mod-billing-connect');

-- Daily: re-derive billing tags for time-based changes no webhook announces
-- (a trial or paid period running out, cancel-at-period-end taking effect).
select public.kit_register_app_schedule(
  'mod-billing-tags',
  '23 4 * * *',
  '/api/mod/billing/cron/tags'
);
