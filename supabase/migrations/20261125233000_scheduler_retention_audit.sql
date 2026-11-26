-- One scheduler (Supabase Cron) · policy-driven retention · append-only audit.
-- docs/ERD.md, docs/MODULES.md → Housekeeping, CLAUDE.md → Vendor features.
--
-- 1. Retention policies (private.retention_policies). Every purge reads its
--    window from here — no literal intervals in purge code — and honours a
--    legal hold. A later compliance module raises the minimums.
-- 2. Audit log (audit.events). Append-only: no role (service_role included)
--    may UPDATE or DELETE it; the only deletion path is the retention purge.
--    No foreign keys, so entries survive user deletion. Server code writes
--    through public.audit_log_event() (service role only).
-- 3. auth_events keeps history after an account is deleted (FK dropped).
-- 4. Housekeeping registry: modules register their purge functions;
--    private.run_housekeeping() runs core + module purges, each isolated, and
--    records the counts in the audit log.
-- 5. Supabase Cron (pg_cron, every plan) schedules:
--      * hourly housekeeping (in-database, no HTTP);
--      * every minute, the app's scheduled endpoints via pg_net, using the
--        app URL + cron secret the runtime bootstrap stores in Vault. Without
--        both secrets the calls are skipped (fresh clone, preview, CI).
--    This replaces Vercel Cron (Hobby: once a day, no retries).
--
-- Append-only + idempotent-friendly.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ============================================================================
-- 1. Retention policies
-- ============================================================================

create table if not exists private.retention_policies (
  data_class text primary key check (data_class ~ '^[a-z][a-z0-9_]*$'),
  keep_days integer not null check (keep_days > 0),
  legal_hold boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

comment on table private.retention_policies is
  'How long each class of data is kept. Purges read their window here; legal_hold suspends a class''s purge.';

-- Defaults sized for the Supabase Free plan. Re-running never overwrites a
-- value someone changed (on conflict do nothing).
insert into private.retention_policies (data_class, keep_days, description) values
  ('audit', 400, 'audit.events'),
  ('pii_activity', 365, 'Per-user activity history (auth_events, …)'),
  ('anonymous_users', 30, 'Anonymous users with no saved favorites, by last sign-in'),
  ('oauth_codes', 1, 'Expired or used MCP authorization codes'),
  ('oauth_tokens', 30, 'Revoked or expired MCP refresh tokens'),
  ('cron_history', 7, 'cron.job_run_details and pg_net responses')
on conflict (data_class) do nothing;

-- Cutoff timestamp for a class, or null when the class is unknown or on legal
-- hold (null = purge nothing — the safe default).
create or replace function private.retention_cutoff(_class text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select now() - make_interval(days => r.keep_days)
  from private.retention_policies r
  where r.data_class = _class and not r.legal_hold;
$$;

-- Modules declare their classes from their migrations (keeps existing values).
create or replace function public.kit_register_retention(
  _class text,
  _keep_days integer,
  _description text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'kit_register_retention: not allowed' using errcode = '42501';
  end if;
  insert into private.retention_policies (data_class, keep_days, description)
  values (_class, _keep_days, _description)
  on conflict (data_class) do nothing;
end;
$$;

-- ============================================================================
-- 2. Audit log
-- ============================================================================

create schema if not exists audit;
revoke all on schema audit from public, anon, authenticated, service_role;

comment on schema audit is
  'Append-only audit log. Not exposed through the Data API; written via public.audit_log_event().';

create table if not exists audit.events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,          -- no FK: entries outlive the account
  actor_type text not null default 'system'
    check (actor_type in ('user', 'staff', 'system', 'service')),
  action text not null check (action ~ '^[a-z][a-z0-9_.:-]*$'),
  entity_type text,
  entity_id text,
  org_id uuid,            -- no FK: entries outlive the workspace
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object')
);

alter table audit.events enable row level security;
revoke all on audit.events from public, anon, authenticated, service_role;

create index if not exists audit_events_occurred_brin
  on audit.events using brin (occurred_at);
create index if not exists audit_events_actor_idx
  on audit.events (actor_id, occurred_at desc)
  where actor_id is not null;
create index if not exists audit_events_entity_idx
  on audit.events (entity_type, entity_id);

-- The only write path. IDs and labels belong here; content and PII don't.
create or replace function private.audit_emit(
  _action text,
  _actor_id uuid default null,
  _actor_type text default 'system',
  _entity_type text default null,
  _entity_id text default null,
  _org_id uuid default null,
  _meta jsonb default '{}'::jsonb
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into audit.events (action, actor_id, actor_type, entity_type, entity_id, org_id, meta)
  values (_action, _actor_id, coalesce(_actor_type, 'system'), _entity_type, _entity_id, _org_id,
          coalesce(_meta, '{}'::jsonb))
  returning id;
$$;

-- Server code (service-role client) logs through this RPC.
create or replace function public.audit_log_event(
  _action text,
  _actor_id uuid default null,
  _actor_type text default 'service',
  _entity_type text default null,
  _entity_id text default null,
  _org_id uuid default null,
  _meta jsonb default '{}'::jsonb
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select private.audit_emit(_action, _actor_id, _actor_type, _entity_type, _entity_id, _org_id, _meta);
$$;

revoke execute on function public.audit_log_event(text, uuid, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.audit_log_event(text, uuid, text, text, text, uuid, jsonb)
  to service_role;

-- ============================================================================
-- 3. auth_events survives account deletion
-- ============================================================================

-- user_id stays (read-own RLS still matches it); history becomes pseudonymous
-- once the account is gone and is removed by the pii_activity policy instead.
alter table public.auth_events drop constraint if exists auth_events_user_id_fkey;

-- ============================================================================
-- 4. Housekeeping
-- ============================================================================

create table if not exists private.housekeeping_tasks (
  fn text primary key check (fn ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$'),
  module text not null,
  created_at timestamptz not null default now()
);

comment on table private.housekeeping_tasks is
  'Purge functions (schema.name, no arguments, returns integer rows removed) run hourly by private.run_housekeeping().';

-- Modules register / unregister from their migrations and drop.sql.
create or replace function public.kit_register_housekeeping(_fn text, _module text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'kit_register_housekeeping: not allowed' using errcode = '42501';
  end if;
  insert into private.housekeeping_tasks (fn, module) values (_fn, _module)
  on conflict (fn) do update set module = excluded.module;
end;
$$;

create or replace function public.kit_unregister_housekeeping(_module text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'kit_unregister_housekeeping: not allowed' using errcode = '42501';
  end if;
  delete from private.housekeeping_tasks where module = _module;
end;
$$;

-- Core purges. Bounded batches; the hourly schedule drains any backlog.
create or replace function private.kit_housekeeping()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _cutoff timestamptz;
  _n integer;
  _total integer := 0;
begin
  -- auth_events (pii_activity)
  _cutoff := private.retention_cutoff('pii_activity');
  if _cutoff is not null then
    delete from public.auth_events e
    where e.id in (
      select x.id from public.auth_events x where x.occurred_at < _cutoff limit 10000
    );
    get diagnostics _n = row_count; _total := _total + _n;
  end if;

  -- MCP authorization codes: expired or consumed
  _cutoff := private.retention_cutoff('oauth_codes');
  if _cutoff is not null then
    delete from public.mcp_authorization_codes c
    where c.expires_at < _cutoff or c.consumed_at < _cutoff;
    get diagnostics _n = row_count; _total := _total + _n;
  end if;

  -- MCP refresh tokens: revoked or expired
  _cutoff := private.retention_cutoff('oauth_tokens');
  if _cutoff is not null then
    delete from public.mcp_refresh_tokens t
    where coalesce(t.revoked_at, t.expires_at) < _cutoff;
    get diagnostics _n = row_count; _total := _total + _n;
  end if;

  -- Anonymous users with nothing saved (Supabase's documented cleanup).
  -- Deleting the auth user cascades to everything they own.
  _cutoff := private.retention_cutoff('anonymous_users');
  if _cutoff is not null then
    delete from auth.users u
    where u.id in (
      select a.id
      from auth.users a
      where a.is_anonymous
        and coalesce(a.last_sign_in_at, a.created_at) < _cutoff
        and not exists (select 1 from public.content_favorites f where f.user_id = a.id)
      limit 1000
    );
    get diagnostics _n = row_count; _total := _total + _n;
  end if;

  -- Scheduler history (Supabase doesn't prune it).
  _cutoff := private.retention_cutoff('cron_history');
  if _cutoff is not null then
    delete from cron.job_run_details d where d.end_time < _cutoff;
    get diagnostics _n = row_count; _total := _total + _n;
  end if;

  -- The audit log itself, only by its own (long) policy.
  _cutoff := private.retention_cutoff('audit');
  if _cutoff is not null then
    delete from audit.events a
    where a.id in (select x.id from audit.events x where x.occurred_at < _cutoff limit 10000);
    get diagnostics _n = row_count; _total := _total + _n;
  end if;

  return _total;
end;
$$;

-- Runs the core purge and every registered module purge. One failing task is
-- logged and skipped; it never blocks the others. Each run leaves one audit
-- entry with the per-task counts.
create or replace function private.run_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5min'
as $$
declare
  _report jsonb := '{}'::jsonb;
  _task record;
  _n integer;
begin
  begin
    _n := private.kit_housekeeping();
    _report := _report || jsonb_build_object('kit', _n);
  exception when others then
    _report := _report || jsonb_build_object('kit', 'error: ' || sqlerrm);
  end;

  for _task in select h.fn, h.module from private.housekeeping_tasks h order by h.fn loop
    begin
      if to_regprocedure(_task.fn || '()') is null then
        _report := _report || jsonb_build_object(_task.fn, 'missing');
        continue;
      end if;
      execute format('select %s()', _task.fn) into _n;
      _report := _report || jsonb_build_object(_task.fn, coalesce(_n, 0));
    exception when others then
      _report := _report || jsonb_build_object(_task.fn, 'error: ' || sqlerrm);
    end;
  end loop;

  perform private.audit_emit('housekeeping.run', null, 'system', null, null, null, _report);
  return _report;
end;
$$;

-- ============================================================================
-- 5. Scheduler: Supabase Cron → app endpoints
-- ============================================================================

-- Written by the runtime bootstrap (lib/db/bootstrap.ts) on every boot: the
-- app's origin as seen FROM the database, and the cron bearer secret. Only
-- rewritten when a value changed. Postgres-only (not exposed, not granted).
create or replace function private.sync_scheduler_secrets(_app_url text, _cron_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _name text;
  _value text;
  _id uuid;
  _current text;
begin
  foreach _name in array array['kit_app_url', 'kit_cron_secret'] loop
    _value := case _name when 'kit_app_url' then _app_url else _cron_secret end;
    select s.id, s.decrypted_secret into _id, _current
    from vault.decrypted_secrets s where s.name = _name;
    if _value is null or _value = '' then
      if _id is not null then
        delete from vault.secrets where id = _id;
      end if;
    elsif _id is null then
      perform vault.create_secret(_value, _name, 'Set by the dream-starter-kit runtime bootstrap');
    elsif _current is distinct from _value then
      perform vault.update_secret(_id, _value);
    end if;
  end loop;
end;
$$;

revoke all on function private.sync_scheduler_secrets(text, text) from public;

-- Fire-and-forget GET to an app path with the cron bearer secret. Returns the
-- pg_net request id, or null when the app URL / secret aren't configured.
create or replace function private.call_app(_path text, _timeout_ms integer default 55000)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  _url text;
  _secret text;
begin
  select decrypted_secret into _url from vault.decrypted_secrets where name = 'kit_app_url';
  select decrypted_secret into _secret from vault.decrypted_secrets where name = 'kit_cron_secret';
  if _url is null or _secret is null then
    return null;
  end if;
  return net.http_get(
    url := rtrim(_url, '/') || _path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || _secret),
    timeout_milliseconds := _timeout_ms
  );
end;
$$;

revoke all on function private.call_app(text, integer) from public;

-- Idempotent: cron.schedule upserts by job name.
select cron.schedule(
  'kit-housekeeping',
  '17 * * * *',
  $$select private.run_housekeeping()$$
);

-- Payload Jobs Queue: enqueue due scheduled tasks, then run a bounded batch.
select cron.schedule(
  'kit-payload-jobs',
  '* * * * *',
  $$select private.call_app('/cms-api/payload-jobs/handle-schedules');
    select private.call_app('/cms-api/payload-jobs/run?limit=10')$$
);

-- Staff notification broadcasts (moves into the Jobs Queue in a later step).
select cron.schedule(
  'kit-notifications-dispatch',
  '* * * * *',
  $$select private.call_app('/api/cms/notifications/dispatch')$$
);

-- Daily site-license report (was a Vercel Cron).
select cron.schedule(
  'kit-dream-site-report',
  '23 5 * * *',
  $$select private.call_app('/api/cms/dream-site/report')$$
);
