-- Workspaces (B2B) core · docs/WORKSPACES.md, docs/ERD.md
--
-- Turns the baseline organizations / memberships / invitations tables into
-- usable workspaces: URL slugs, an invite-link token, onboarding progress,
-- secure email-invite tokens, and the SECURITY DEFINER RPCs every
-- cross-boundary write goes through. Also adds the profile fields the
-- onboarding steps write (title, active workspace, email preferences), a
-- co-member profile read policy, and RESTRICTIVE no-anon policies.
--
-- The founder-level `accountModel` setting (consumer | business | hybrid)
-- lives in the Payload authentication-settings global and NEVER touches RLS:
-- everything here is inert until the app starts calling it.
--
-- Append-only + idempotent-friendly (if not exists / drop-then-create).

-- ============================================================================
-- Slug rules — the SAME list + pattern live in packages/app/src/workspaces.ts
-- (client-side validation). Keep them in sync.
-- ============================================================================

create or replace function public.is_reserved_slug(_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(_slug) = any (array[
    'a', 'admin', 'api', 'auth', 'billing', 'cms-api', 'cms-setup', 'invite',
    'join', 'mcp', 'oauth', 'onboarding', 'pricing', 'profile', 'sign-in',
    'sign-up', 'welcome', 'w', 'www'
  ]);
$$;

comment on function public.is_reserved_slug(text) is
  'True for workspace slugs that collide with app routes. Mirrored in packages/app/src/workspaces.ts.';

-- ============================================================================
-- organizations: slug, branding, invite link, domain-restricted joins
-- ============================================================================

-- Lowercase-only by pattern, so plain text + unique is case-insensitive in
-- practice (no citext dependency). Existing rows (and direct inserts that omit
-- it) get a random, valid, non-reserved `org-xxxxxxxxxxxx` default; the
-- create_workspace RPC always sets a chosen slug.
alter table public.organizations
  add column if not exists slug text not null
    default ('org-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
alter table public.organizations add column if not exists logo_url text;
alter table public.organizations add column if not exists join_token_hash text;
alter table public.organizations
  add column if not exists join_link_enabled boolean not null default true;
alter table public.organizations
  add column if not exists allowed_domains text[] not null default '{}';
alter table public.organizations
  add column if not exists data jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_slug_key'
  ) then
    alter table public.organizations
      add constraint organizations_slug_key unique (slug);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_slug_format'
  ) then
    alter table public.organizations
      add constraint organizations_slug_format
        check (slug ~ '^[a-z0-9](-?[a-z0-9]){1,38}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_slug_not_reserved'
  ) then
    alter table public.organizations
      add constraint organizations_slug_not_reserved
        check (not public.is_reserved_slug(slug));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_join_token_hash_key'
  ) then
    alter table public.organizations
      add constraint organizations_join_token_hash_key unique (join_token_hash);
  end if;
end;
$$;

comment on column public.organizations.slug is
  'Workspace URL slug (lowercase, 2–39 chars, no leading/trailing/double hyphen, not reserved).';
comment on column public.organizations.join_token_hash is
  'SHA-256 (hex) of the rotating invite-link token. The plaintext is shown once and never stored.';
comment on column public.organizations.allowed_domains is
  'When non-empty, invite-link joins require an email at one of these domains.';

-- ============================================================================
-- memberships: per-person onboarding progress (resume the stepper)
-- ============================================================================

alter table public.memberships add column if not exists onboarding_step text;
alter table public.memberships
  add column if not exists onboarding_completed_at timestamptz;
alter table public.memberships
  add column if not exists onboarding_done text[] not null default '{}';

comment on column public.memberships.onboarding_step is
  'Key of the next onboarding step to show this member in this workspace (null = not started).';
comment on column public.memberships.onboarding_done is
  'Onboarding step keys this member finished (vs skipped) — drives the getting-started checklist.';

-- ============================================================================
-- invitations: hashed token, expiry, audit, revoke
-- ============================================================================

alter table public.invitations add column if not exists token_hash text;
alter table public.invitations
  add column if not exists invited_by uuid references public.profiles (id) on delete set null;
alter table public.invitations add column if not exists expires_at timestamptz;
alter table public.invitations add column if not exists accepted_at timestamptz;
alter table public.invitations
  add column if not exists accepted_by uuid references public.profiles (id) on delete set null;

alter table public.invitations drop constraint if exists invitations_status_check;
alter table public.invitations
  add constraint invitations_status_check
    check (status in ('pending', 'accepted', 'revoked'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invitations_token_hash_key'
  ) then
    alter table public.invitations
      add constraint invitations_token_hash_key unique (token_hash);
  end if;
end;
$$;

-- One live invite per (workspace, email).
create unique index if not exists invitations_one_pending_per_email
  on public.invitations (org_id, lower(email))
  where status = 'pending';
create index if not exists invitations_email_lower_idx
  on public.invitations (lower(email));

comment on column public.invitations.token_hash is
  'SHA-256 (hex) of the 32-byte random invite token. The plaintext only ever lives in the emailed link.';

-- ============================================================================
-- profiles: title, active workspace, email preferences
-- ============================================================================

alter table public.profiles add column if not exists title text;
alter table public.profiles
  add column if not exists last_org_id uuid references public.organizations (id) on delete set null;
alter table public.profiles
  add column if not exists email_preferences jsonb not null default '{}'::jsonb;

comment on column public.profiles.last_org_id is
  'The workspace the user last had active. Must be a workspace they belong to (enforced by trigger).';
comment on column public.profiles.email_preferences is
  'Onboarding "Stay in the loop" choices, e.g. {"tips": true, "product_updates": false}.';

-- Same column-level grant pattern as display_name/avatar_url/phone.
grant update (title, last_org_id, email_preferences) on public.profiles to authenticated;

-- last_org_id is a preference, but never let it point at a workspace the user
-- doesn't belong to (prevents probing org ids via the FK and keeps
-- getActiveOrg() honest).
create or replace function public.guard_profile_last_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_org_id is not null
     and new.last_org_id is distinct from old.last_org_id
     and not exists (
       select 1 from public.memberships m
       where m.org_id = new.last_org_id and m.user_id = new.id
     ) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_last_org on public.profiles;
create trigger profiles_guard_last_org
  before update of last_org_id on public.profiles
  for each row execute function public.guard_profile_last_org();

-- ============================================================================
-- memberships: a workspace always keeps at least one owner
-- ============================================================================

-- Blocks demoting/removing the last owner. Cascades are exempt: when the
-- workspace itself or the member's profile is being deleted, the parent row is
-- already gone by the time the cascaded membership delete runs.
create or replace function public.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and new.org_id = old.org_id then
    return new;
  end if;
  if not exists (select 1 from public.organizations o where o.id = old.org_id)
     or not exists (select 1 from public.profiles p where p.id = old.user_id) then
    return coalesce(new, old);
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.org_id = old.org_id and m.role = 'owner' and m.id <> old.id
  ) then
    raise exception 'last_owner' using errcode = 'P0001',
      hint = 'Transfer ownership to another member first.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists memberships_guard_last_owner on public.memberships;
create trigger memberships_guard_last_owner
  before update or delete on public.memberships
  for each row execute function public.guard_last_owner();

-- ============================================================================
-- Helpers
-- ============================================================================

-- True when the caller's JWT is an anonymous (Turnstile) session.
create or replace function public.is_anonymous_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
$$;

-- The caller's email, only when it is confirmed (security definer: reads auth.users).
create or replace function public.confirmed_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid())
    and u.email is not null
    and u.email_confirmed_at is not null;
$$;

revoke execute on function public.confirmed_email() from public, anon;
grant execute on function public.confirmed_email() to authenticated;

-- ============================================================================
-- RPCs (security definer, empty search_path, authenticated only)
-- Errors are raised as stable snake_case messages the client maps to copy.
-- ============================================================================

-- is_slug_available: format + reserved + uniqueness.
create or replace function public.is_slug_available(_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    _slug is not null
    and _slug ~ '^[a-z0-9](-?[a-z0-9]){1,38}$'
    and not public.is_reserved_slug(_slug)
    and not exists (select 1 from public.organizations o where o.slug = _slug);
$$;

-- create_workspace: non-anon caller creates a workspace and becomes its owner
-- (the on_organization_created trigger inserts the owner membership).
create or replace function public.create_workspace(_name text, _slug text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _clean_name text := btrim(coalesce(_name, ''));
  _clean_slug text := lower(btrim(coalesce(_slug, '')));
  _org public.organizations;
begin
  if _uid is null or public.is_anonymous_session() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if char_length(_clean_name) < 1 or char_length(_clean_name) > 64 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if _clean_slug !~ '^[a-z0-9](-?[a-z0-9]){1,38}$' then
    raise exception 'invalid_slug' using errcode = 'P0001';
  end if;
  if public.is_reserved_slug(_clean_slug)
     or exists (select 1 from public.organizations o where o.slug = _clean_slug) then
    raise exception 'slug_unavailable' using errcode = 'P0001';
  end if;

  begin
    insert into public.organizations (name, slug, owner_id)
    values (_clean_name, _clean_slug, _uid)
    returning * into _org;
  exception when unique_violation then
    raise exception 'slug_unavailable' using errcode = 'P0001';
  end;

  update public.profiles set last_org_id = _org.id where id = _uid;
  return _org;
end;
$$;

-- accept_invitation: the invitee (confirmed email matching the invite) joins.
create or replace function public.accept_invitation(_token text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _email text;
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
  where i.token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex')
  for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;
  if _inv.status = 'revoked' then
    raise exception 'invite_revoked' using errcode = 'P0001';
  end if;
  if _inv.status = 'accepted' then
    -- Idempotent for the person who already accepted it.
    if _inv.accepted_by = _uid then
      select * into _org from public.organizations o where o.id = _inv.org_id;
      return _org;
    end if;
    raise exception 'invite_used' using errcode = 'P0001';
  end if;
  if _inv.expires_at is not null and _inv.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  _email := public.confirmed_email();
  if _email is null or _email <> lower(_inv.email) then
    raise exception 'invite_wrong_account' using errcode = 'P0001';
  end if;

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

-- join_workspace_by_link: anyone with the (enabled) link joins as a member,
-- subject to the workspace's allowed email domains.
create or replace function public.join_workspace_by_link(_token text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _email text;
  _org public.organizations;
begin
  if _uid is null or public.is_anonymous_session() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if _token is null or char_length(_token) < 16 then
    raise exception 'join_link_invalid' using errcode = 'P0001';
  end if;

  select * into _org from public.organizations o
  where o.join_token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex');
  if not found then
    raise exception 'join_link_invalid' using errcode = 'P0001';
  end if;
  if not _org.join_link_enabled then
    raise exception 'join_link_disabled' using errcode = 'P0001';
  end if;

  _email := public.confirmed_email();
  if _email is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if cardinality(_org.allowed_domains) > 0
     and not (split_part(_email, '@', 2) = any (
       select lower(d) from unnest(_org.allowed_domains) as d
     )) then
    raise exception 'join_domain_not_allowed' using errcode = 'P0001';
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (_org.id, _uid, 'member')
  on conflict (org_id, user_id) do nothing;

  update public.profiles set last_org_id = _org.id where id = _uid;
  return _org;
end;
$$;

-- my_pending_invitations: the invitee's only window onto their invites.
-- Never returns tokens. Matches the caller's CONFIRMED email only.
create or replace function public.my_pending_invitations()
returns table (
  invitation_id uuid,
  org_id uuid,
  org_name text,
  org_slug text,
  logo_url text,
  inviter_name text,
  role text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    o.id,
    o.name,
    o.slug,
    o.logo_url,
    p.display_name,
    i.role,
    i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.org_id
  left join public.profiles p on p.id = i.invited_by
  where i.status = 'pending'
    and (i.expires_at is null or i.expires_at > now())
    and not public.is_anonymous_session()
    and lower(i.email) = public.confirmed_email()
    and not exists (
      select 1 from public.memberships m
      where m.org_id = i.org_id and m.user_id = (select auth.uid())
    )
  order by i.created_at desc;
$$;

-- save_onboarding_progress: a member records their own stepper position in a
-- workspace. Memberships are admin-write under RLS, so members (invitees)
-- need this narrow door; it can only touch the caller's own row and only the
-- two onboarding columns.
create or replace function public.save_onboarding_progress(
  _org_id uuid,
  _step text,
  _completed boolean default false,
  _done text default null
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
  if (_step is not null and _step !~ '^[a-z0-9][a-z0-9:_-]{0,63}$')
     or (_done is not null and _done !~ '^[a-z0-9][a-z0-9:_-]{0,63}$') then
    raise exception 'invalid_step' using errcode = 'P0001';
  end if;
  update public.memberships
  set onboarding_step = _step,
      onboarding_completed_at = case
        when _completed then coalesce(onboarding_completed_at, now())
        else onboarding_completed_at
      end,
      onboarding_done = case
        when _done is null or _done = any (onboarding_done) then onboarding_done
        else array_append(onboarding_done, _done)
      end
  where org_id = _org_id and user_id = (select auth.uid());
  if not found then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
end;
$$;

-- Execute grants: authenticated only, never anon/public.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.is_slug_available(text)',
    'public.create_workspace(text, text)',
    'public.accept_invitation(text)',
    'public.join_workspace_by_link(text)',
    'public.my_pending_invitations()',
    'public.save_onboarding_progress(uuid, text, boolean, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ============================================================================
-- Policies
-- ============================================================================

-- Co-members can read each other's profiles (member lists, mentions).
drop policy if exists "profiles: co-members read" on public.profiles;
create policy "profiles: co-members read"
  on public.profiles for select to authenticated
  using (exists (
    select 1
    from public.memberships me
    join public.memberships them on them.org_id = me.org_id
    where me.user_id = (select auth.uid())
      and them.user_id = profiles.id
  ));

-- Anonymous (Turnstile) sessions never touch workspace tables.
do $$
declare
  t text;
begin
  foreach t in array array['organizations', 'memberships', 'invitations'] loop
    execute format('drop policy if exists %I on public.%I', t || ': no anon', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (coalesce(((select auth.jwt()) ->> ''is_anonymous'')::boolean, false) = false) '
      'with check (coalesce(((select auth.jwt()) ->> ''is_anonymous'')::boolean, false) = false)',
      t || ': no anon', t
    );
  end loop;
end;
$$;

-- ============================================================================
-- Avatars: public-read bucket for profile photos (onboarding "Set up your
-- profile"). Teammates must see each other's photos, which the private,
-- owner-only `user-files` bucket can't serve. Writes are confined to the
-- owner's "<user_id>/" prefix, like user-files.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "avatars: select own" on storage.objects;
create policy "avatars: select own"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: insert own" on storage.objects;
create policy "avatars: insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

drop policy if exists "avatars: update own" on storage.objects;
create policy "avatars: update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
