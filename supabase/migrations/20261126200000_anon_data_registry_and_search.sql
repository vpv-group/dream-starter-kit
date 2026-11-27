-- Anonymous-user data registry + search extensions (kit 2.x, for modules such
-- as feedback that let anonymous visitors vote/post).
--
-- 1. pg_trgm + vector in `extensions` (both on Supabase's free plan): fuzzy
--    title matching and embedding similarity for modules. Extension DDL needs
--    the migration owner, which module migrations don't get.
-- 2. A registry of per-module anonymous-data handlers:
--      kit_register_anon_data(module, merge_fn, has_data_fn)
--    • merge_fn(_from uuid, _to uuid) returns void — moves the anonymous
--      user's rows onto the permanent account (lib/auth/merge-anon.ts calls
--      public.kit_merge_anon_data before deleting the anonymous user, which
--      would otherwise cascade the rows away).
--    • has_data_fn(_user uuid) returns boolean — true while the anonymous user
--      owns rows worth keeping; the hourly cleanup of idle anonymous users
--      skips them (it already skipped users with content_favorites).
-- 3. private.kit_housekeeping is recreated with that extra check (the body is
--    otherwise unchanged from 20261125233000).

create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- 2. Registry
-- ---------------------------------------------------------------------------

create table if not exists private.anon_data_handlers (
  module text primary key,
  merge_fn text not null check (merge_fn ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$'),
  has_data_fn text not null check (has_data_fn ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$'),
  created_at timestamptz not null default now()
);

comment on table private.anon_data_handlers is
  'Per-module handlers for anonymous-user data: merge_fn(_from uuid, _to uuid) and has_data_fn(_user uuid) → boolean.';

create or replace function public.kit_register_anon_data(
  _module text,
  _merge_fn text,
  _has_data_fn text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'kit_register_anon_data: not allowed' using errcode = '42501';
  end if;
  insert into private.anon_data_handlers (module, merge_fn, has_data_fn)
  values (_module, _merge_fn, _has_data_fn)
  on conflict (module) do update
    set merge_fn = excluded.merge_fn, has_data_fn = excluded.has_data_fn;
end;
$$;

create or replace function public.kit_unregister_anon_data(_module text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'kit_unregister_anon_data: not allowed' using errcode = '42501';
  end if;
  delete from private.anon_data_handlers where module = _module;
end;
$$;

-- Service role only (called by lib/auth/merge-anon.ts). One failing handler is
-- reported and skipped; the others still run.
create or replace function public.kit_merge_anon_data(_from uuid, _to uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _h record;
  _report jsonb := '{}'::jsonb;
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'kit_merge_anon_data: not allowed' using errcode = '42501';
  end if;
  if _from is null or _to is null or _from = _to then
    return _report;
  end if;
  for _h in select module, merge_fn from private.anon_data_handlers order by module loop
    begin
      if to_regprocedure(_h.merge_fn || '(uuid, uuid)') is null then
        _report := _report || jsonb_build_object(_h.module, 'missing');
        continue;
      end if;
      execute format('select %s($1, $2)', _h.merge_fn) using _from, _to;
      _report := _report || jsonb_build_object(_h.module, 'ok');
    exception when others then
      _report := _report || jsonb_build_object(_h.module, 'error: ' || sqlerrm);
    end;
  end loop;
  return _report;
end;
$$;

revoke execute on function public.kit_merge_anon_data(uuid, uuid) from public, anon, authenticated;
grant execute on function public.kit_merge_anon_data(uuid, uuid) to service_role;

-- True when any registered module holds data for this (anonymous) user.
create or replace function private.anon_has_module_data(_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _h record;
  _has boolean;
begin
  for _h in select has_data_fn from private.anon_data_handlers loop
    begin
      if to_regprocedure(_h.has_data_fn || '(uuid)') is null then
        continue;
      end if;
      execute format('select %s($1)', _h.has_data_fn) into _has using _user;
      if coalesce(_has, false) then
        return true;
      end if;
    exception when others then
      -- A broken handler must not let the cleanup delete data: keep the user.
      return true;
    end;
  end loop;
  return false;
end;
$$;

revoke execute on function private.anon_has_module_data(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Idle anonymous-user cleanup also respects module data
-- ---------------------------------------------------------------------------

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
        and not private.anon_has_module_data(a.id)
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
