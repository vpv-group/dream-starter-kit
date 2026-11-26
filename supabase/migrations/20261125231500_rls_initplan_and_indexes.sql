-- Scale hardening · workspace RLS evaluated once per query + index hygiene.
-- docs/ERD.md (RLS & ownership model), docs/WORKSPACES.md.
--
-- 1. Org-scoped policies used `public.is_org_member(org_id)` /
--    `is_org_admin(org_id)`. Those are SECURITY DEFINER, so Postgres can't
--    inline them, and because they take a row column they run once PER ROW.
--    The Supabase-documented pattern is `org_id = any (array(select
--    <set-returning definer fn>()))`: the function doesn't depend on the row,
--    so it runs once per statement (an InitPlan), and the array comparison
--    lets the planner use the primary-key / unique indexes.
--    The helpers live in a `private` schema that PostgREST does NOT expose
--    (Supabase: never put security-definer helpers in an exposed schema).
--    The public is_org_member()/is_org_admin() RPCs stay for clients and RPCs.
-- 2. Indexes: cover the helper's lookup, index the remaining FK columns that
--    ON DELETE actions scan, and drop indexes a unique key already covers.
-- 3. workspace_members() pages with a keyset cursor (it used to return every
--    member, which PostgREST silently cut at max_rows).
--
-- Append-only + idempotent-friendly.

-- ============================================================================
-- 1. private helpers + org-scoped policies
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

comment on schema private is
  'Security-definer helpers used by RLS policies. Not exposed through the Data API.';

-- Workspaces the caller belongs to / administers.
create or replace function private.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid());
$$;

create or replace function private.user_admin_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.role in ('owner', 'admin');
$$;

revoke all on function private.user_org_ids() from public, anon;
revoke all on function private.user_admin_org_ids() from public, anon;
grant execute on function private.user_org_ids() to authenticated, service_role;
grant execute on function private.user_admin_org_ids() to authenticated, service_role;

-- organizations
drop policy if exists "orgs: select if member" on public.organizations;
create policy "orgs: select if member"
  on public.organizations for select to authenticated
  using (
    owner_id = (select auth.uid())
    or id = any (array(select private.user_org_ids()))
  );

-- memberships
drop policy if exists "memberships: select if member" on public.memberships;
create policy "memberships: select if member"
  on public.memberships for select to authenticated
  using (org_id = any (array(select private.user_org_ids())));

drop policy if exists "memberships: admins insert" on public.memberships;
create policy "memberships: admins insert"
  on public.memberships for insert to authenticated
  with check (org_id = any (array(select private.user_admin_org_ids())));

drop policy if exists "memberships: admins update" on public.memberships;
create policy "memberships: admins update"
  on public.memberships for update to authenticated
  using (org_id = any (array(select private.user_admin_org_ids())))
  with check (org_id = any (array(select private.user_admin_org_ids())));

drop policy if exists "memberships: admins delete" on public.memberships;
create policy "memberships: admins delete"
  on public.memberships for delete to authenticated
  using (org_id = any (array(select private.user_admin_org_ids())));

-- invitations
drop policy if exists "invitations: admins all" on public.invitations;
create policy "invitations: admins all"
  on public.invitations for all to authenticated
  using (org_id = any (array(select private.user_admin_org_ids())))
  with check (org_id = any (array(select private.user_admin_org_ids())));

-- ============================================================================
-- 2. Indexes
-- ============================================================================

-- memberships: the helpers look up by user_id and read org_id + role — make
-- that an index-only scan. It supersedes the single-column user_id index; the
-- org_id index is a prefix of the (org_id, user_id) unique key.
create index if not exists memberships_user_org_role_idx
  on public.memberships (user_id, org_id) include (role);
drop index if exists public.memberships_user_id_idx;
drop index if exists public.memberships_org_id_idx;

-- profiles.last_org_id: ON DELETE SET NULL from organizations scans profiles
-- without it.
create index if not exists profiles_last_org_id_idx
  on public.profiles (last_org_id)
  where last_org_id is not null;

-- invitations: SET NULL FKs to profiles, and the 50/day rate-limit count.
create index if not exists invitations_invited_by_idx
  on public.invitations (invited_by)
  where invited_by is not null;
create index if not exists invitations_accepted_by_idx
  on public.invitations (accepted_by)
  where accepted_by is not null;
create index if not exists invitations_org_created_idx
  on public.invitations (org_id, created_at);
drop index if exists public.invitations_org_id_idx;

-- MCP OAuth: cascading FKs to clients and profiles.
create index if not exists mcp_authorization_codes_client_idx
  on public.mcp_authorization_codes (client_id);
create index if not exists mcp_authorization_codes_user_idx
  on public.mcp_authorization_codes (supabase_user_id);
create index if not exists mcp_refresh_tokens_client_idx
  on public.mcp_refresh_tokens (client_id);

-- content_favorites: (user_id) is a prefix of the unique key; per-item
-- lookups (orphan cleanup when CMS content is deleted, counts) need the other
-- direction.
drop index if exists public.content_favorites_user_id_idx;
create index if not exists content_favorites_item_idx
  on public.content_favorites (collection, item_id);

-- user_tags: (user_id) is a prefix of the (user_id, tag_id) unique key.
drop index if exists public.user_tags_user_id_idx;

-- auth_events: append-only, deleted by age — BRIN is tiny and fits that.
create index if not exists auth_events_occurred_brin
  on public.auth_events using brin (occurred_at);

-- ============================================================================
-- 3. workspace_members(): keyset pages
-- ============================================================================

-- Same columns and order as before (owners, admins, members; then join date),
-- plus a stable tiebreak. Pass the last row's user_id as _after for the next
-- page. Defaults keep old one-argument callers working (first 1000 rows).
drop function if exists public.workspace_members(uuid);

create or replace function public.workspace_members(
  _org uuid,
  _limit integer default 1000,
  _after uuid default null
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  title text,
  email text,
  role text,
  joined_at timestamptz,
  is_you boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _cursor_rank integer;
  _cursor_at timestamptz;
begin
  if not public.is_org_member(_org) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  if _after is not null then
    select case c.role when 'owner' then 0 when 'admin' then 1 else 2 end, c.created_at
      into _cursor_rank, _cursor_at
    from public.memberships c
    where c.org_id = _org and c.user_id = _after;
  end if;
  return query
    select
      m.user_id,
      p.display_name,
      p.avatar_url,
      p.title,
      u.email::text,
      m.role,
      m.created_at,
      m.user_id = (select auth.uid())
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.org_id = _org
      and (
        _cursor_rank is null
        or (case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at, m.user_id)
           > (_cursor_rank, _cursor_at, _after)
      )
    order by
      case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      m.created_at,
      m.user_id
    limit least(greatest(coalesce(_limit, 1000), 1), 1000);
end;
$$;

revoke execute on function public.workspace_members(uuid, integer, uuid) from public, anon;
grant execute on function public.workspace_members(uuid, integer, uuid) to authenticated;
