-- Notifications 1.1 · the producer contract.
--
-- Other modules (CRM, client portal, …) PRODUCE notifications; this module
-- DELIVERS them. Producers describe what happened and how each channel should
-- render it; they never send email or push themselves. Today delivery is the
-- in-app feed (plus Expo push from the TypeScript notify() path). Email, web
-- push, preferences and a delivery queue are added inside this module later,
-- behind the same contract, so producers don't change.
--
-- What this migration adds (all additive, reattach-friendly):
--   * mod_notifications: category, source_module, url, entity_type/entity_id,
--     actor_id, channels, payload (per-channel renderings), dedupe_key.
--   * mod_notifications_categories: producers register the categories they
--     emit (from their own migrations), so a future preferences screen can
--     list them with a label, audience and default channels.
--   * mod_notifications_emit(...): the one SQL entry point for producers'
--     triggers and definer functions.

-- ============================================================================
-- Contract columns
-- ============================================================================

alter table public.mod_notifications
  add column if not exists category text,
  add column if not exists source_module text,
  add column if not exists url text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists actor_id uuid references public.profiles (id) on delete set null,
  add column if not exists channels text[],
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists dedupe_key text;

-- Channels a producer may request. `in_app` is the feed; the others are
-- delivered once this module grows those channels.
alter table public.mod_notifications
  drop constraint if exists mod_notifications_channels_check;
alter table public.mod_notifications
  add constraint mod_notifications_channels_check
  check (channels is null or channels <@ array['in_app', 'push', 'web_push', 'email', 'sms']::text[]);

-- Click-through targets: an app path ("/a/…") or an https URL — never
-- javascript:, data: or protocol-relative ("//evil.example") links.
alter table public.mod_notifications
  drop constraint if exists mod_notifications_url_check;
alter table public.mod_notifications
  add constraint mod_notifications_url_check
  check (url is null or url ~ '^(/($|[^/\\])|https://)');

alter table public.mod_notifications
  drop constraint if exists mod_notifications_payload_check;
alter table public.mod_notifications
  add constraint mod_notifications_payload_check
  check (jsonb_typeof(payload) = 'object');

-- One notification per (user, dedupe_key): producers pass a stable key
-- ("case-comment:<id>") so a retried trigger or route never notifies twice.
create unique index if not exists mod_notifications_dedupe_idx
  on public.mod_notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists mod_notifications_user_created_idx
  on public.mod_notifications (user_id, created_at desc);

-- ============================================================================
-- Category registry
-- ============================================================================

create table if not exists public.mod_notifications_categories (
  -- "<module>.<thing>[.<event>]", e.g. "client-portal.case.reply".
  key text primary key
    check (key ~ '^[a-z][a-z0-9-]*(\.[a-z0-9_-]+)+$'),
  module text not null,
  label text not null,
  description text,
  -- Who receives it: product users (client), staff, or anyone.
  audience text not null default 'everyone'
    check (audience in ('client', 'staff', 'everyone')),
  default_channels text[] not null default array['in_app', 'push']::text[]
    check (default_channels <@ array['in_app', 'push', 'web_push', 'email', 'sms']::text[]),
  -- Transactional notifications (security, receipts, direct replies) can't
  -- be switched off entirely by a future preferences screen.
  transactional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mod_notifications_categories enable row level security;

-- Readable by signed-in users (a preferences screen lists them). No write
-- policy: rows are written by module migrations (the table owner) only.
drop policy if exists "mod_notifications_categories: read" on public.mod_notifications_categories;
create policy "mod_notifications_categories: read"
  on public.mod_notifications_categories for select to authenticated
  using (true);

drop policy if exists "mod_notifications_categories: no anon" on public.mod_notifications_categories;
create policy "mod_notifications_categories: no anon"
  on public.mod_notifications_categories as restrictive for all to anon
  using (false);

-- Producers register categories with this upsert so a module update can
-- change a label without a conflict error.
create or replace function public.mod_notifications_register_category(
  _key text,
  _module text,
  _label text,
  _description text default null,
  _audience text default 'everyone',
  _default_channels text[] default array['in_app', 'push']::text[],
  _transactional boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only system code (migrations, service role) registers categories.
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_notifications_register_category: not allowed'
      using errcode = '42501';
  end if;
  insert into public.mod_notifications_categories
    (key, module, label, description, audience, default_channels, transactional)
  values (_key, _module, _label, _description, _audience,
          coalesce(_default_channels, array['in_app', 'push']::text[]),
          coalesce(_transactional, false))
  on conflict (key) do update
    set module = excluded.module,
        label = excluded.label,
        description = excluded.description,
        audience = excluded.audience,
        default_channels = excluded.default_channels,
        transactional = excluded.transactional,
        updated_at = now();
end;
$$;

-- ============================================================================
-- mod_notifications_emit — the producer entry point
-- ============================================================================
--
-- Inserts one notification and returns its id (null when the dedupe key was
-- already used, or when _user is null). Allowed callers:
--   * a trigger (pg_trigger_depth() > 0) — producers' row triggers;
--   * system code: the service role, or a session with no JWT (cron, edge
--     functions using the SQL contract, migrations);
--   * a producer's definer function that set the transaction-local flag
--     `mod_notifications.emit = 'on'` (clients can't set GUCs over PostgREST);
--   * anyone notifying themself (the feed's own RLS already allows that).
-- A signed-in client calling it directly for someone else is refused, so the
-- RPC can't be used to spam other users.
--
-- The future delivery fan-out (deliveries queue, email, web push, user
-- preferences) hangs off this function and the row it writes.
create or replace function public.mod_notifications_emit(
  _user uuid,
  _category text,
  _title text default null,
  _body text default null,
  _url text default null,
  _entity_type text default null,
  _entity_id text default null,
  _channels text[] default null,
  _payload jsonb default '{}'::jsonb,
  _dedupe_key text default null,
  _actor uuid default null,
  _source_module text default null,
  _data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _id uuid;
begin
  if _user is null or _category is null then
    return null;
  end if;
  -- coalesce(..., false): any NULL in the checks (anon has no auth.uid())
  -- must refuse, never fall through.
  if not coalesce(
    pg_trigger_depth() > 0
    or coalesce(current_setting('mod_notifications.emit', true), '') = 'on'
    or coalesce((select auth.role()), '') not in ('authenticated', 'anon')
    or _user is not distinct from (select auth.uid()),
    false
  ) then
    raise exception 'mod_notifications_emit: not allowed' using errcode = '42501';
  end if;

  insert into public.mod_notifications (
    user_id, type, category, source_module, title, body, url,
    entity_type, entity_id, actor_id, channels, payload, dedupe_key, data
  )
  values (
    _user,
    _category,
    _category,
    coalesce(_source_module, split_part(_category, '.', 1)),
    _title,
    _body,
    _url,
    _entity_type,
    _entity_id,
    _actor,
    _channels,
    coalesce(_payload, '{}'::jsonb),
    _dedupe_key,
    -- Keep data.url for readers written before the url column existed.
    coalesce(_data, '{}'::jsonb)
      || case when _url is not null then jsonb_build_object('url', _url) else '{}'::jsonb end
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into _id;

  return _id;
end;
$$;

-- A producer's drop.sql removes its categories with this (no DML whitelist
-- needed on this module's tables). Past notifications are kept.
create or replace function public.mod_notifications_unregister_module(_module text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_notifications_unregister_module: not allowed'
      using errcode = '42501';
  end if;
  delete from public.mod_notifications_categories where module = _module;
end;
$$;
