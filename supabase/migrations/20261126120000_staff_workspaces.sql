-- staff_workspaces: the list behind the header workspace switcher
-- (docs/WORKSPACES.md → Staff workspace view).
--
-- Staff aren't members of their customers' workspaces, and memberships /
-- organizations are member-scoped under RLS, so staff need a narrow,
-- read-only door: every workspace's id, name, slug, logo and member count.
-- Nothing else (no member names, no invite state). The switcher only scopes
-- the UI; each module's own staff policies still decide what staff can read.

create or replace function public.staff_workspaces(
  _q text default null,
  _limit integer default 50,
  _ids uuid[] default null
)
returns table (
  id uuid,
  name text,
  slug text,
  logo_url text,
  member_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or public.is_anonymous_session()
     or not coalesce(
       (select p.is_staff from public.profiles p where p.id = (select auth.uid())),
       false
     ) then
    raise exception 'staff_workspaces: staff only' using errcode = '42501';
  end if;

  return query
    select
      o.id,
      o.name,
      o.slug,
      o.logo_url,
      (select count(*)::integer from public.memberships m where m.org_id = o.id)
    from public.organizations o
    where (_ids is null or o.id = any (_ids))
      and (
        nullif(btrim(coalesce(_q, '')), '') is null
        or o.name ilike '%' || btrim(_q) || '%'
        or o.slug ilike '%' || btrim(_q) || '%'
      )
    order by lower(o.name), o.id
    limit least(greatest(coalesce(_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.staff_workspaces(text, integer, uuid[]) from public, anon;
grant execute on function public.staff_workspaces(text, integer, uuid[]) to authenticated;
