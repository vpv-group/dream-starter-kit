-- Organizations you can actually use, plus auth events.
--
-- 1. profiles.email — mirrored from auth.users (read-own), kept in sync on
--    email change and anonymous → permanent conversion (also fixes the stale
--    profiles.is_anonymous flag). Modules can't read auth.users, so this is
--    how they learn a user's email.
-- 2. organizations.website / is_personal, invitation lifecycle columns.
-- 3. RPCs for the onboarding flow: my_invitations, accept_invitation,
--    decline_invitation, ensure_personal_org, org_members.
-- 4. auth_events — one row per auth email sent, sign-in and account change,
--    derived from Supabase's auth audit log by a trigger. Links and codes are
--    never stored. docs/AUTH.md → Auth events.
--
-- Append-only + idempotent-friendly. docs/ERD.md.

-- ============================================================================
-- 1. profiles.email
-- ============================================================================

alter table public.profiles add column if not exists email text;
create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

comment on column public.profiles.email is
  'Mirror of auth.users.email (null for anonymous users). Read-own under RLS; written only by auth triggers.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, is_anonymous, is_staff, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.is_anonymous, false),
    -- First NON-anonymous profile becomes staff (the founder/admin); anon never.
    (not coalesce(new.is_anonymous, false))
      and (select count(*) = 0 from public.profiles where is_anonymous = false),
    nullif(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Keep email + anonymity in step with auth.users (email change confirmed,
-- anonymous visitor converted to a permanent account).
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = nullif(new.email, ''),
         is_anonymous = coalesce(new.is_anonymous, false)
   where id = new.id
     and (email is distinct from nullif(new.email, '')
          or is_anonymous is distinct from coalesce(new.is_anonymous, false));
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, is_anonymous on auth.users
  for each row execute function public.handle_user_updated();

-- Backfill existing profiles.
update public.profiles p
   set email = nullif(u.email, ''),
       is_anonymous = coalesce(u.is_anonymous, false)
  from auth.users u
 where u.id = p.id
   and (p.email is distinct from nullif(u.email, '')
        or p.is_anonymous is distinct from coalesce(u.is_anonymous, false));

-- ============================================================================
-- 2. organizations + invitations
-- ============================================================================

alter table public.organizations add column if not exists website text;
alter table public.organizations
  add column if not exists is_personal boolean not null default false;
create unique index if not exists organizations_one_personal_per_owner
  on public.organizations (owner_id) where is_personal;

alter table public.invitations
  add column if not exists invited_by uuid references public.profiles (id) on delete set null;
alter table public.invitations add column if not exists responded_at timestamptz;
alter table public.invitations
  add column if not exists expires_at timestamptz not null default (now() + interval '14 days');
alter table public.invitations drop constraint if exists invitations_status_check;
alter table public.invitations add constraint invitations_status_check
  check (status in ('pending', 'accepted', 'declined', 'revoked'));
create unique index if not exists invitations_one_pending_per_email
  on public.invitations (org_id, lower(email)) where status = 'pending';
create index if not exists invitations_email_lower_idx
  on public.invitations (lower(email));

-- Admins may update an organization too (name, website), not only the owner.
drop policy if exists "orgs: update admin" on public.organizations;
create policy "orgs: update admin"
  on public.organizations for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- Members may leave an organization (delete their own membership), except
-- the owner, who must delete or transfer the organization instead.
drop policy if exists "memberships: leave own" on public.memberships;
create policy "memberships: leave own"
  on public.memberships for delete to authenticated
  using (user_id = (select auth.uid()) and role <> 'owner');

-- ============================================================================
-- 3. Onboarding RPCs
-- ============================================================================

-- The caller's verified email from the JWT; null for anonymous sessions.
create or replace function public.current_user_email()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then null
    else nullif(lower((select auth.jwt()) ->> 'email'), '')
  end;
$$;

-- Pending, unexpired invitations addressed to the caller's email.
create or replace function public.my_invitations()
returns table (
  id uuid,
  org_id uuid,
  org_name text,
  org_website text,
  role text,
  invited_by_name text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.org_id, o.name, o.website, i.role, p.display_name,
         i.created_at, i.expires_at
    from public.invitations i
    join public.organizations o on o.id = i.org_id
    left join public.profiles p on p.id = i.invited_by
   where public.current_user_email() is not null
     and lower(i.email) = public.current_user_email()
     and i.status = 'pending'
     and i.expires_at > now()
   order by i.created_at desc;
$$;

create or replace function public.accept_invitation(_invitation uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
  me text := public.current_user_email();
begin
  if me is null or (select auth.uid()) is null then
    raise exception 'Sign in with the invited email address to accept.'
      using errcode = '42501';
  end if;
  select * into inv from public.invitations
   where id = _invitation and status = 'pending' and expires_at > now()
   for update;
  if not found or lower(inv.email) <> me then
    raise exception 'This invitation is not available.' using errcode = 'P0002';
  end if;
  insert into public.memberships (org_id, user_id, role)
  values (inv.org_id, (select auth.uid()),
          case when inv.role = 'owner' then 'admin' else inv.role end)
  on conflict (org_id, user_id) do nothing;
  update public.invitations
     set status = 'accepted', responded_at = now()
   where id = inv.id;
  return inv.org_id;
end;
$$;

create or replace function public.decline_invitation(_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me text := public.current_user_email();
begin
  if me is null then
    raise exception 'Sign in with the invited email address.' using errcode = '42501';
  end if;
  update public.invitations
     set status = 'declined', responded_at = now()
   where id = _invitation and status = 'pending' and lower(email) = me;
  if not found then
    raise exception 'This invitation is not available.' using errcode = 'P0002';
  end if;
end;
$$;

-- Idempotent: the caller's personal organization, created on first call.
create or replace function public.ensure_personal_org()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  org uuid;
  label text;
begin
  if me is null or public.current_user_email() is null then
    raise exception 'Personal organizations need a signed-in, non-anonymous user.'
      using errcode = '42501';
  end if;
  select id into org from public.organizations where owner_id = me and is_personal;
  if org is not null then
    return org;
  end if;
  select coalesce(nullif(display_name, ''), split_part(email, '@', 1))
    into label from public.profiles where id = me;
  insert into public.organizations (name, owner_id, is_personal)
  values (coalesce(label, 'Personal'), me, true)
  on conflict do nothing
  returning id into org;
  if org is null then
    select id into org from public.organizations where owner_id = me and is_personal;
  end if;
  return org;
end;
$$;

-- Members of an organization with their names and emails. Profiles are
-- read-own under RLS, so co-members are only visible through this function,
-- and only to members of the same organization.
create or replace function public.org_members(_org uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  email text,
  role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.display_name, p.avatar_url, p.email, m.role, m.created_at
    from public.memberships m
    join public.profiles p on p.id = m.user_id
   where m.org_id = _org
     and public.is_org_member(_org)
   order by m.created_at;
$$;

revoke execute on function public.my_invitations() from anon;
revoke execute on function public.accept_invitation(uuid) from anon;
revoke execute on function public.decline_invitation(uuid) from anon;
revoke execute on function public.ensure_personal_org() from anon;
revoke execute on function public.org_members(uuid) from anon;

-- ============================================================================
-- 4. auth_events
-- ============================================================================

create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text,
  action text not null,
  category text not null check (category in ('email', 'session', 'account')),
  email_kind text check (email_kind in (
    'confirmation', 'sign_in_or_recovery', 'invite', 'email_change', 'reauthentication'
  )),
  occurred_at timestamptz not null default now()
);
create index if not exists auth_events_user_idx
  on public.auth_events (user_id, occurred_at desc);

comment on table public.auth_events is
  'Auth emails sent, sign-ins and account changes per user, derived from the Supabase auth audit log. Never contains links, codes or tokens. Read-own; written only by trigger.';

alter table public.auth_events enable row level security;
drop policy if exists "auth_events: select own" on public.auth_events;
create policy "auth_events: select own"
  on public.auth_events for select to authenticated
  using (user_id = (select auth.uid()));

-- Map one audit-log row to an auth_events row. Never raises: auth must not
-- fail because of bookkeeping.
create or replace function public.handle_auth_audit_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  act text := new.payload ->> 'action';
  actor uuid;
  target uuid;
  cat text;
  kind text;
  addr text;
begin
  begin
    actor := nullif(new.payload ->> 'actor_id', '')::uuid;
  exception when others then
    actor := null;
  end;

  begin
    case act
      when 'user_confirmation_requested' then
        cat := 'email'; kind := 'confirmation'; target := actor;
      when 'user_recovery_requested' then
        -- GoTrue logs magic-link / email-OTP sign-ins and password resets the
        -- same way; they can't be told apart here.
        cat := 'email'; kind := 'sign_in_or_recovery'; target := actor;
      when 'user_reauthenticate_requested' then
        cat := 'email'; kind := 'reauthentication'; target := actor;
      when 'user_invited' then
        cat := 'email'; kind := 'invite';
        target := nullif(new.payload -> 'traits' ->> 'user_id', '')::uuid;
      when 'user_modified' then
        -- An email change request has no action of its own; detect it from
        -- the user row GoTrue just updated.
        if exists (
          select 1 from auth.users u
           where u.id = actor
             and coalesce(u.email_change, '') <> ''
             and u.email_change_sent_at > now() - interval '1 minute'
        ) then
          cat := 'email'; kind := 'email_change'; target := actor;
        else
          return new;
        end if;
      when 'login' then
        cat := 'session'; target := actor;
      when 'user_signedup', 'user_updated_password', 'user_deleted' then
        cat := 'account'; target := actor;
      else
        return new;
    end case;

    if target is null then
      return new;
    end if;
    -- Skip anonymous users and users without a profile (deleted, or not yet mirrored).
    if not exists (
      select 1 from public.profiles p where p.id = target and not p.is_anonymous
    ) then
      return new;
    end if;

    if kind = 'email_change' then
      select u.email_change into addr from auth.users u where u.id = target;
    else
      select u.email into addr from auth.users u where u.id = target;
    end if;

    insert into public.auth_events (audit_id, user_id, email, action, category, email_kind, occurred_at)
    values (new.id, target, nullif(addr, ''), act, cat, kind, coalesce(new.created_at, now()))
    on conflict (audit_id) do nothing;
  exception when others then
    raise warning 'auth_events: skipped audit entry % (%): %', new.id, act, sqlerrm;
  end;
  return new;
end;
$$;

-- Hosted projects may not let the migration role attach triggers to the auth
-- schema's audit table. Don't fail the migration if so; docs/AUTH.md explains
-- how to check that auth events are flowing.
do $$
begin
  execute 'drop trigger if exists on_auth_audit_entry on auth.audit_log_entries';
  execute 'create trigger on_auth_audit_entry
             after insert on auth.audit_log_entries
             for each row execute function public.handle_auth_audit_entry()';
exception when insufficient_privilege then
  raise notice 'auth_events: no privilege to attach a trigger to auth.audit_log_entries; auth events are disabled.';
end;
$$;
