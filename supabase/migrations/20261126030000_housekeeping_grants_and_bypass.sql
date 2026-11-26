-- 2.5 hardening: housekeeping registration and grants, private-function
-- grants, and Vercel Deployment Protection for Supabase Cron's calls.
--
-- 1. Module housekeeping functions are SECURITY DEFINER in `public`, so the
--    REST API could call them. Module SQL can't REVOKE, so the kit does it:
--    kit_register_housekeeping() now revokes API execute on what it
--    registers, and every function already registered is revoked here.
-- 2. Modules that shipped a `mod_<slug>_housekeeping()` before this registry
--    existed (their migration ran on an older kit and skipped registration)
--    are registered now. Only no-argument functions returning integer count;
--    the slug comes from the name (`mod_client_portal_kit_housekeeping` →
--    `client-portal`), matching each module's drop.sql.
-- 3. `private` functions default to PUBLIC execute. The schema isn't exposed
--    to the API, but revoke it anyway (defense in depth); the two helpers RLS
--    policies call keep their explicit `authenticated` grant.
-- 4. private.call_app sends Vercel's `x-vercel-protection-bypass` header when
--    the boot step stored the "Protection Bypass for Automation" secret
--    (private.sync_scheduler_bypass), so Deployment Protection doesn't block
--    the scheduler.
--
-- Append-only + idempotent-friendly.

-- 1. ------------------------------------------------------------------------
create or replace function public.kit_register_housekeeping(_fn text, _module text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _proc regprocedure;
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'kit_register_housekeeping: not allowed' using errcode = '42501';
  end if;
  insert into private.housekeeping_tasks (fn, module) values (_fn, _module)
  on conflict (fn) do update set module = excluded.module;
  -- The table's check constraint has validated `_fn` as schema.name.
  _proc := to_regprocedure(_fn || '()');
  if _proc is not null then
    execute format('revoke execute on function %s from public, anon, authenticated', _proc);
  end if;
end;
$$;

-- 2. ------------------------------------------------------------------------
do $$
declare
  _r record;
  _slug text;
begin
  for _r in
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ~ '^mod_[a-z0-9_]+_housekeeping$'
      and p.pronargs = 0
      and p.prorettype = 'integer'::regtype
  loop
    _slug := replace(
      regexp_replace(regexp_replace(_r.proname, '^mod_', ''), '(_kit)?_housekeeping$', ''),
      '_', '-'
    );
    insert into private.housekeeping_tasks (fn, module)
    values ('public.' || _r.proname, _slug)
    on conflict (fn) do nothing;
  end loop;

  for _r in select h.fn from private.housekeeping_tasks h loop
    if to_regprocedure(_r.fn || '()') is not null then
      execute format(
        'revoke execute on function %s from public, anon, authenticated',
        to_regprocedure(_r.fn || '()')
      );
    end if;
  end loop;
end;
$$;

-- 3. ------------------------------------------------------------------------
revoke execute on all functions in schema private from public;
alter default privileges in schema private revoke execute on functions from public;
grant execute on function private.user_org_ids() to authenticated, service_role;
grant execute on function private.user_admin_org_ids() to authenticated, service_role;

-- 4. ------------------------------------------------------------------------
create or replace function private.sync_scheduler_bypass(_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _id uuid;
  _current text;
begin
  select s.id, s.decrypted_secret into _id, _current
  from vault.decrypted_secrets s where s.name = 'kit_vercel_bypass';
  if _secret is null or _secret = '' then
    if _id is not null then
      delete from vault.secrets where id = _id;
    end if;
  elsif _id is null then
    perform vault.create_secret(_secret, 'kit_vercel_bypass',
      'Vercel Protection Bypass for Automation, set by the runtime bootstrap');
  elsif _current is distinct from _secret then
    perform vault.update_secret(_id, _secret);
  end if;
end;
$$;

revoke all on function private.sync_scheduler_bypass(text) from public;

create or replace function private.call_app(_path text, _timeout_ms integer default 55000)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  _url text;
  _secret text;
  _bypass text;
  _headers jsonb;
begin
  select decrypted_secret into _url from vault.decrypted_secrets where name = 'kit_app_url';
  select decrypted_secret into _secret from vault.decrypted_secrets where name = 'kit_cron_secret';
  if _url is null or _secret is null then
    return null;
  end if;
  select decrypted_secret into _bypass from vault.decrypted_secrets where name = 'kit_vercel_bypass';
  _headers := jsonb_build_object('Authorization', 'Bearer ' || _secret);
  if _bypass is not null then
    _headers := _headers || jsonb_build_object('x-vercel-protection-bypass', _bypass);
  end if;
  return net.http_get(
    url := rtrim(_url, '/') || _path,
    headers := _headers,
    timeout_milliseconds := _timeout_ms
  );
end;
$$;

revoke all on function private.call_app(text, integer) from public;
