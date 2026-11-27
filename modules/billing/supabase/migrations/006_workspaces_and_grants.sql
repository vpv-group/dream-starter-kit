-- Billing 2.1 · workspace-owned plans and staff grants.
--
--   * A purchase can belong to a WORKSPACE (org_id): the company pays, every
--     member gets the entitlement, owners/admins manage it. user_id stays the
--     person who bought it (or, for a staff grant, the workspace owner).
--   * Members read their workspace's purchases (the one SELECT policy now
--     covers own OR workspace rows; one permissive policy per action keeps
--     the advisors quiet), so mod_billing_entitlements — security_invoker —
--     lists workspace entitlements to every member automatically.
--   * mod_billing_org_customer_links: one provider customer per (workspace,
--     provider); readable by the workspace's owners/admins.
--   * Staff grants ("comp" plans): rows with provider 'manual', store
--     'promotional', plus who granted them and why. A grant with an end date
--     stops counting once it passes (the view checks; the daily billing-tags
--     run marks it canceled).
--
-- Expand-only; mod_billing_apply_subscription keeps its signature (new keys
-- in _row are optional). Reattach-friendly.

alter table public.mod_billing_subscriptions
  add column if not exists org_id uuid
    references public.organizations (id) on delete cascade,
  add column if not exists granted_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists note text;

create index if not exists mod_billing_subscriptions_org_idx
  on public.mod_billing_subscriptions (org_id)
  where org_id is not null;
create index if not exists mod_billing_subscriptions_granted_by_idx
  on public.mod_billing_subscriptions (granted_by)
  where granted_by is not null;

drop policy if exists "mod_billing_subscriptions: select own"
  on public.mod_billing_subscriptions;
drop policy if exists "mod_billing_subscriptions: select own or workspace"
  on public.mod_billing_subscriptions;
create policy "mod_billing_subscriptions: select own or workspace"
  on public.mod_billing_subscriptions for select to authenticated
  using (
    user_id = (select auth.uid())
    or org_id = any (array(select private.user_org_ids()))
  );

create table if not exists public.mod_billing_org_customer_links (
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, provider),
  unique (provider, provider_customer_id)
);

alter table public.mod_billing_org_customer_links enable row level security;

drop policy if exists "mod_billing_org_customer_links: select workspace admins"
  on public.mod_billing_org_customer_links;
create policy "mod_billing_org_customer_links: select workspace admins"
  on public.mod_billing_org_customer_links for select to authenticated
  using (org_id = any (array(select private.user_admin_org_ids())));

-- Entitlements now include workspace purchases (through RLS) and drop staff
-- grants whose end date has passed. Columns are appended, never reordered.
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
  s.current_period_end as expires_at,
  s.org_id
from public.mod_billing_subscriptions s
where s.status in ('active', 'trialing')
  and (
    s.provider <> 'manual'
    or s.current_period_end is null
    or s.current_period_end > now()
  );

-- 005's function, plus org_id / granted_by / note (all optional in _row).
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
  if _row ->> 'price_id' is not null then
    insert into public.mod_billing_prices (id, active, provider)
    values (_row ->> 'price_id', true, _provider)
    on conflict (id) do nothing;
  end if;
  insert into public.mod_billing_subscriptions as s (
    id, user_id, price_id, status, quantity, cancel_at_period_end,
    current_period_end, stripe_event_at, provider_event_at, updated_at,
    provider, kind, plan_id, entitlement, store, environment,
    org_id, granted_by, note
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
    _row ->> 'environment',
    (_row ->> 'org_id')::uuid,
    (_row ->> 'granted_by')::uuid,
    _row ->> 'note'
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
        org_id = coalesce(excluded.org_id, s.org_id),
        granted_by = coalesce(excluded.granted_by, s.granted_by),
        note = coalesce(excluded.note, s.note),
        updated_at = now()
    where coalesce(s.provider_event_at, s.stripe_event_at) is null
       or excluded.provider_event_at is null
       or excluded.provider_event_at >= coalesce(s.provider_event_at, s.stripe_event_at)
  returning true into _applied;
  return coalesce(_applied, false);
end;
$$;
