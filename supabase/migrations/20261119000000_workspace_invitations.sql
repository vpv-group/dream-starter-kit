-- Workspace invitations (B2B PR 2) · docs/WORKSPACES.md, docs/ERD.md
--
-- Builds on 20261118000000_workspaces.sql:
--   * privacy: replaces the co-member profiles read policy (which exposed whole
--     profile rows, phone included) with workspace_members(), a safe-columns RPC;
--   * invitations: create/resend in SQL (tokens generated here, returned once,
--     stored only as SHA-256), accept by invitation id for the "You've been
--     invited" screen, and token previews for the public /invite + /join pages;
--   * invite links: reset / enable / restrict by domain (free-mail blocked);
--   * roles: only owners may grant, change or remove the owner role;
--   * account deletion: a sole owner of a workspace with other members can't be
--     deleted until ownership is transferred (DB-enforced; the delete-account
--     edge function pre-checks for a clear message).
--
-- Append-only + idempotent-friendly. Every function: security definer,
-- set search_path = '', stable snake_case error messages.

-- ============================================================================
-- Privacy: no more whole-row profile reads between co-members
-- ============================================================================

drop policy if exists "profiles: co-members read" on public.profiles;

-- ============================================================================
-- Helpers (internal — not executable by API roles)
-- ============================================================================

-- 32 random bytes, URL-safe base64 without padding (43 chars).
create or replace function public.new_url_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

create or replace function public.sha256_hex(_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(_value, 'UTF8')), 'hex');
$$;

-- Free-mail domains can't restrict an invite link (anyone could join).
-- Mirrored in packages/app/src/workspaces.ts (FREE_MAIL_DOMAINS).
create or replace function public.is_free_mail_domain(_domain text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(_domain) = any (array[
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'msn.com', 'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'mail.com',
    'yandex.com', 'zoho.com', 'hey.com', 'fastmail.com'
  ]);
$$;

-- The caller is an owner of the workspace.
create or replace function public.is_org_owner(_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = _org and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Shared acceptance: membership (idempotent), audit stamp, active workspace.
-- Callers have already checked status/expiry/email.
create or replace function public.apply_invitation(_inv public.invitations)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _org public.organizations;
begin
  insert into public.memberships (org_id, user_id, role)
  values (_inv.org_id, _uid, _inv.role)
  on conflict (org_id, user_id) do nothing;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = _uid
  where id = _inv.id;

  update public.profiles set last_org_id = _inv.org_id where id = _uid;

  select * into _org from public.organizations o where o.id = _inv.org_id;
  return _org;
end;
$$;

-- Validate a pending invite for the caller; raises the stable error codes.
create or replace function public.check_invitation_for_caller(_inv public.invitations)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _email text;
begin
  if _inv.status = 'revoked' then
    raise exception 'invite_revoked' using errcode = 'P0001';
  end if;
  if _inv.status = 'accepted' then
    raise exception 'invite_used' using errcode = 'P0001';
  end if;
  if _inv.expires_at is not null and _inv.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  _email := public.confirmed_email();
  if _email is null or _email <> lower(_inv.email) then
    raise exception 'invite_wrong_account' using errcode = 'P0001';
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.new_url_token()',
    'public.apply_invitation(public.invitations)',
    'public.check_invitation_for_caller(public.invitations)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- ============================================================================
-- Accepting
-- ============================================================================

-- accept_invitation: same contract as before, now sharing the helpers. An
-- already-accepted invite stays idempotent for the person who accepted it.
create or replace function public.accept_invitation(_token text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _inv public.invitations;
  _org public.organizations;
begin
  if _uid is null or public.is_anonymous_session() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if _token is null or char_length(_token) < 16 then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  select * into _inv from public.invitations i
  where i.token_hash = public.sha256_hex(_token)
  for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;
  if _inv.status = 'accepted' and _inv.accepted_by = _uid then
    select * into _org from public.organizations o where o.id = _inv.org_id;
    return _org;
  end if;

  perform public.check_invitation_for_caller(_inv);
  return public.apply_invitation(_inv);
end;
$$;

-- accept_pending_invitation: the "You've been invited" screen — the invitee
-- holds no token, but their CONFIRMED email matching the invite is the proof.
create or replace function public.accept_pending_invitation(_invitation_id uuid)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _inv public.invitations;
begin
  if _uid is null or public.is_anonymous_session() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into _inv from public.invitations i where i.id = _invitation_id for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  perform public.check_invitation_for_caller(_inv);
  return public.apply_invitation(_inv);
end;
$$;

-- ============================================================================
-- Members list (safe columns only)
-- ============================================================================

create or replace function public.workspace_members(_org uuid)
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
begin
  if not public.is_org_member(_org) then
    raise exception 'not_a_member' using errcode = 'P0001';
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
    order by
      case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      m.created_at;
end;
$$;

-- ============================================================================
-- Creating / resending invitations
-- ============================================================================

-- create_invitations: owners/admins invite by email. Returns one row per
-- distinct address; `invite_token` (plaintext, shown once) is set for rows the
-- server should email. ~50 invites per workspace per day.
create or replace function public.create_invitations(
  _org uuid,
  _emails text[],
  _role text default 'member',
  _expires_days integer default 7
)
returns table (
  invite_email text,
  result text,
  invite_token text,
  invitation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _days integer := least(30, greatest(1, coalesce(_expires_days, 7)));
  _sent_today integer;
  _addr text;
  _token text;
  _id uuid;
begin
  if _uid is null or public.is_anonymous_session() or public.confirmed_email() is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not public.is_org_admin(_org) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if _role not in ('member', 'admin') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(_emails), 0) = 0 or cardinality(_emails) > 50 then
    raise exception 'invalid_email_list' using errcode = 'P0001';
  end if;

  select count(*) into _sent_today
  from public.invitations i
  where i.org_id = _org and i.created_at > now() - interval '1 day';

  for _addr in
    select distinct lower(btrim(e)) from unnest(_emails) as e where btrim(e) <> ''
  loop
    invite_email := _addr;
    invite_token := null;
    invitation_id := null;

    if _addr !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      result := 'invalid';
    elsif exists (
      select 1 from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.org_id = _org and lower(u.email) = _addr
    ) then
      result := 'already_member';
    elsif _sent_today >= 50 then
      result := 'rate_limited';
    else
      _token := public.new_url_token();
      -- Re-inviting a pending address rotates its token and expiry.
      update public.invitations i
      set token_hash = public.sha256_hex(_token),
          expires_at = now() + make_interval(days => _days),
          invited_by = _uid,
          role = _role
      where i.org_id = _org and lower(i.email) = _addr and i.status = 'pending'
      returning i.id into _id;
      if _id is null then
        insert into public.invitations (org_id, email, role, token_hash, invited_by, expires_at)
        values (_org, _addr, _role, public.sha256_hex(_token), _uid, now() + make_interval(days => _days))
        returning id into _id;
        _sent_today := _sent_today + 1;
      end if;
      result := 'invited';
      invite_token := _token;
      invitation_id := _id;
      _id := null;
    end if;
    return next;
  end loop;
end;
$$;

-- resend_invitation: rotate a pending invite's token + expiry (the old link
-- stops working) and return the new token for the server to email.
create or replace function public.resend_invitation(
  _invitation_id uuid,
  _expires_days integer default 7
)
returns table (invite_email text, invite_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _inv public.invitations;
  _token text := public.new_url_token();
  _days integer := least(30, greatest(1, coalesce(_expires_days, 7)));
begin
  if (select auth.uid()) is null or public.is_anonymous_session() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into _inv from public.invitations i where i.id = _invitation_id for update;
  if not found or not public.is_org_admin(_inv.org_id) then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;
  if _inv.status <> 'pending' then
    raise exception 'invite_not_pending' using errcode = 'P0001';
  end if;
  update public.invitations
  set token_hash = public.sha256_hex(_token),
      expires_at = now() + make_interval(days => _days),
      invited_by = (select auth.uid())
  where id = _inv.id;
  invite_email := _inv.email;
  invite_token := _token;
  return next;
end;
$$;

-- ============================================================================
-- Public previews (the /invite/[token] and /join/[token] pages)
-- ============================================================================

-- invitation_preview: what the token holder may see. Never returns hashes.
create or replace function public.invitation_preview(_token text)
returns table (
  status text,
  org_name text,
  org_slug text,
  logo_url text,
  inviter_name text,
  email text,
  role text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _inv public.invitations;
begin
  if _token is null or char_length(_token) < 16 then
    status := 'not_found';
    return next;
    return;
  end if;
  select * into _inv from public.invitations i
  where i.token_hash = public.sha256_hex(_token);
  if not found then
    status := 'not_found';
    return next;
    return;
  end if;

  status := case
    when _inv.status = 'revoked' then 'revoked'
    when _inv.status = 'accepted' then 'used'
    when _inv.expires_at is not null and _inv.expires_at <= now() then 'expired'
    else 'valid'
  end;
  select o.name, o.slug, o.logo_url into org_name, org_slug, logo_url
  from public.organizations o where o.id = _inv.org_id;
  select p.display_name into inviter_name
  from public.profiles p where p.id = _inv.invited_by;
  email := _inv.email;
  role := _inv.role;
  expires_at := _inv.expires_at;
  return next;
end;
$$;

-- join_link_preview: workspace name/logo for an invite link.
create or replace function public.join_link_preview(_token text)
returns table (
  status text,
  org_name text,
  org_slug text,
  logo_url text,
  allowed_domains text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _org public.organizations;
begin
  if _token is null or char_length(_token) < 16 then
    status := 'not_found';
    return next;
    return;
  end if;
  select * into _org from public.organizations o
  where o.join_token_hash = public.sha256_hex(_token);
  if not found then
    status := 'not_found';
    return next;
    return;
  end if;
  status := case when _org.join_link_enabled then 'valid' else 'disabled' end;
  org_name := _org.name;
  org_slug := _org.slug;
  logo_url := _org.logo_url;
  allowed_domains := _org.allowed_domains;
  return next;
end;
$$;

-- ============================================================================
-- Invite links (owners/admins)
-- ============================================================================

-- reset_join_link: new token (old link stops working), link enabled; the
-- plaintext is returned once.
create or replace function public.reset_join_link(_org uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _token text := public.new_url_token();
begin
  if (select auth.uid()) is null or public.is_anonymous_session()
     or not public.is_org_admin(_org) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  update public.organizations
  set join_token_hash = public.sha256_hex(_token), join_link_enabled = true
  where id = _org;
  return _token;
end;
$$;

-- set_join_link: enable/disable and restrict to company domains.
create or replace function public.set_join_link(
  _org uuid,
  _enabled boolean,
  _allowed_domains text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _domains text[];
  _d text;
begin
  if (select auth.uid()) is null or public.is_anonymous_session()
     or not public.is_org_admin(_org) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct lower(btrim(d))), '{}')
  into _domains
  from unnest(coalesce(_allowed_domains, '{}')) as d
  where btrim(d) <> '';
  foreach _d in array _domains loop
    if _d !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$' then
      raise exception 'invalid_domain' using errcode = 'P0001';
    end if;
    if public.is_free_mail_domain(_d) then
      raise exception 'free_mail_domain' using errcode = 'P0001';
    end if;
  end loop;
  update public.organizations
  set join_link_enabled = coalesce(_enabled, join_link_enabled),
      allowed_domains = _domains
  where id = _org;
end;
$$;

-- ============================================================================
-- Roles: only owners grant, change or remove the owner role
-- ============================================================================

create or replace function public.guard_owner_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _org uuid := coalesce(new.org_id, old.org_id);
begin
  -- Service role / internal jobs (no JWT) and cascades from a deleted
  -- workspace or profile are not user actions.
  if _uid is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' and (
    not exists (select 1 from public.organizations o where o.id = old.org_id)
    or not exists (select 1 from public.profiles p where p.id = old.user_id)
  ) then
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'owner'
       and not exists (
         select 1 from public.organizations o
         where o.id = new.org_id and o.owner_id = new.user_id
       )
       and not public.is_org_owner(new.org_id) then
      raise exception 'owners_only' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (old.role = 'owner' or new.role = 'owner')
       and old.role is distinct from new.role
       and not public.is_org_owner(_org) then
      raise exception 'owners_only' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- DELETE: removing another owner takes an owner (leaving yourself is fine,
  -- subject to the last-owner guard).
  if old.role = 'owner' and old.user_id <> _uid and not public.is_org_owner(_org) then
    raise exception 'owners_only' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists memberships_guard_owner_role on public.memberships;
create trigger memberships_guard_owner_role
  before insert or update or delete on public.memberships
  for each row execute function public.guard_owner_role();

-- ============================================================================
-- Account deletion: sole owners of shared workspaces must transfer first
-- ============================================================================

-- Workspaces where _user is the only owner and someone else is a member.
create or replace function public.blocking_owned_workspaces(_user uuid)
returns table (org_id uuid, org_name text, member_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, (select count(*)::integer from public.memberships x where x.org_id = o.id)
  from public.organizations o
  join public.memberships me on me.org_id = o.id and me.user_id = _user and me.role = 'owner'
  where not exists (
      select 1 from public.memberships other
      where other.org_id = o.id and other.role = 'owner' and other.user_id <> _user
    )
    and exists (
      select 1 from public.memberships other
      where other.org_id = o.id and other.user_id <> _user
    );
$$;

-- The caller's own blocking workspaces (delete-account pre-check, settings UI).
create or replace function public.my_blocking_workspaces()
returns table (org_id uuid, org_name text, member_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.blocking_owned_workspaces((select auth.uid()));
$$;

create or replace function public.guard_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.blocking_owned_workspaces(old.id)) then
    raise exception 'sole_owner_with_members' using errcode = 'P0001',
      hint = 'Transfer ownership of shared workspaces before deleting the account.';
  end if;
  return old;
end;
$$;

drop trigger if exists profiles_guard_delete on public.profiles;
create trigger profiles_guard_delete
  before delete on public.profiles
  for each row execute function public.guard_profile_delete();

-- ============================================================================
-- Execute grants
-- ============================================================================

do $$
declare
  f text;
begin
  -- Signed-in users only.
  foreach f in array array[
    'public.accept_invitation(text)',
    'public.accept_pending_invitation(uuid)',
    'public.workspace_members(uuid)',
    'public.create_invitations(uuid, text[], text, integer)',
    'public.resend_invitation(uuid, integer)',
    'public.reset_join_link(uuid)',
    'public.set_join_link(uuid, boolean, text[])',
    'public.my_blocking_workspaces()',
    'public.is_org_owner(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- Public pages (token holders may be signed out).
  foreach f in array array[
    'public.invitation_preview(text)',
    'public.join_link_preview(text)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;

  -- Server-side only.
  execute 'revoke execute on function public.blocking_owned_workspaces(uuid) from public, anon, authenticated';
end;
$$;
