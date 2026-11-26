-- Notifications 1.2 · delivery fixes.
--
-- 1. Push tokens are unique per DEVICE (token), not per (user, token). A
--    shared or re-logged-in device used to stay registered to every account
--    that ever used it, so it received other users' pushes. Registration now
--    goes through mod_notifications_register_push_token(), which moves the
--    token to the caller.
-- 2. Broadcasts are set-based. The dispatcher used to read `profiles` and
--    push tokens through PostgREST, which silently stops at `max_rows`
--    (1000), and it included anonymous users. mod_notifications_broadcast()
--    inserts the in-app rows in one statement, and
--    mod_notifications_audience_tokens() pages tokens with a keyset cursor.
--    Both refuse signed-in and anonymous callers (service role / no JWT only);
--    module SQL can't GRANT or REVOKE, so each function checks its caller.
--
-- Reattach-friendly (if not exists / drop-then-create / or replace).

-- ============================================================================
-- 1. One row per device token
-- ============================================================================

-- Keep the newest registration of each token before adding the constraint.
delete from public.mod_notifications_push_tokens t
using public.mod_notifications_push_tokens newer
where t.token = newer.token
  and (t.created_at, t.id) < (newer.created_at, newer.id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mod_notifications_push_tokens_token_key'
  ) then
    alter table public.mod_notifications_push_tokens
      add constraint mod_notifications_push_tokens_token_key unique (token);
  end if;
end;
$$;

-- The old (user_id, token) key is now redundant (token alone is unique).
-- Its name depends on whether the table predates the ext_ → mod_ rename.
alter table public.mod_notifications_push_tokens
  drop constraint if exists mod_notifications_push_tokens_user_id_token_key;
alter table public.mod_notifications_push_tokens
  drop constraint if exists ext_notifications_push_tokens_user_id_token_key;

-- Register (or move) the calling device's token to the caller.
create or replace function public.mod_notifications_register_push_token(
  _token text,
  _platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_anonymous_session() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if _token is null or char_length(_token) not between 1 and 512 then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  if _platform not in ('ios', 'android', 'web') then
    raise exception 'invalid_platform' using errcode = 'P0001';
  end if;
  insert into public.mod_notifications_push_tokens (user_id, token, platform)
  values ((select auth.uid()), _token, _platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        created_at = now();
end;
$$;

-- ============================================================================
-- 2. Set-based broadcast
-- ============================================================================

-- Audience: 'all' (every permanent user), 'users' (_user_ids) or 'tags'
-- (users carrying any of _tag_names). Anonymous users are never included.
create or replace function public.mod_notifications_audience(
  _audience text,
  _user_ids uuid[] default null,
  _tag_names text[] default null
)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- System callers only (service role, or no JWT). Module SQL can't GRANT or
  -- REVOKE, so every service-only function checks its caller itself.
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_notifications_audience: not allowed' using errcode = '42501';
  end if;
  return query
    select p.id
    from public.profiles p
    where not p.is_anonymous
      and case _audience
        when 'all' then true
        when 'users' then p.id = any (coalesce(_user_ids, '{}'))
        when 'tags' then exists (
          select 1
          from public.user_tags ut
          join public.tags t on t.id = ut.tag_id
          where ut.user_id = p.id and t.name = any (coalesce(_tag_names, '{}'))
        )
        else false
      end;
end;
$$;

-- Insert one in-app notification per audience member. Idempotent per
-- (user, _dedupe_key), so a retried broadcast never duplicates rows.
-- Returns the number of rows inserted.
create or replace function public.mod_notifications_broadcast(
  _dedupe_key text,
  _category text,
  _title text default null,
  _body text default null,
  _url text default null,
  _data jsonb default '{}'::jsonb,
  _audience text default 'all',
  _user_ids uuid[] default null,
  _tag_names text[] default null,
  _source_module text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _inserted integer;
begin
  -- System callers only (service role, or no JWT: cron / migrations).
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_notifications_broadcast: not allowed' using errcode = '42501';
  end if;
  if _dedupe_key is null or _category is null then
    raise exception 'mod_notifications_broadcast: dedupe key and category are required'
      using errcode = '22023';
  end if;

  insert into public.mod_notifications (
    user_id, type, category, source_module, title, body, url, data, dedupe_key
  )
  select
    a.user_id,
    _category,
    _category,
    coalesce(_source_module, split_part(_category, '.', 1)),
    _title,
    _body,
    _url,
    coalesce(_data, '{}'::jsonb)
      || case when _url is not null then jsonb_build_object('url', _url) else '{}'::jsonb end,
    _dedupe_key
  from public.mod_notifications_audience(_audience, _user_ids, _tag_names) a
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics _inserted = row_count;
  return _inserted;
end;
$$;

-- Page through the audience's push tokens: pass the last id you got as
-- _after (null for the first page). Ordered by id for a stable keyset. The
-- audience predicate is written out here rather than calling
-- mod_notifications_audience(): a security-definer function can't be inlined,
-- so every page would otherwise rebuild the whole audience.
create or replace function public.mod_notifications_audience_tokens(
  _audience text,
  _user_ids uuid[] default null,
  _tag_names text[] default null,
  _after uuid default null,
  _limit integer default 500
)
returns table (id uuid, token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_notifications_audience_tokens: not allowed' using errcode = '42501';
  end if;
  return query
    select t.id, t.token
    from public.mod_notifications_push_tokens t
    join public.profiles p on p.id = t.user_id
    where not p.is_anonymous
      and (_after is null or t.id > _after)
      and case _audience
        when 'all' then true
        when 'users' then t.user_id = any (coalesce(_user_ids, '{}'))
        when 'tags' then exists (
          select 1
          from public.user_tags ut
          join public.tags tg on tg.id = ut.tag_id
          where ut.user_id = t.user_id and tg.name = any (coalesce(_tag_names, '{}'))
        )
        else false
      end
    order by t.id
    limit least(greatest(coalesce(_limit, 500), 1), 1000);
end;
$$;
