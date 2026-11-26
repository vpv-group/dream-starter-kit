-- handle_new_user(): constant-time founder check, race-safe.
--
-- The previous version ran `select count(*) = 0 from profiles where
-- is_anonymous = false` on EVERY signup — a full count that grows with the
-- user base — and two concurrent first signups could both see zero and both
-- become staff. Now:
--   * `not exists` over a partial index on permanent profiles (O(1) once any
--     permanent profile exists);
--   * only when that says "no founder yet" do we take a transaction-scoped
--     advisory lock and re-check, so concurrent first signups serialize and
--     exactly one becomes the founder. Every later signup skips the lock.
-- Behaviour is otherwise unchanged (anon users are never staff; email mirror).
-- Append-only + idempotent-friendly.

create index if not exists profiles_permanent_created_idx
  on public.profiles (created_at)
  where not is_anonymous;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _is_anon boolean := coalesce(new.is_anonymous, false);
  _founder boolean := false;
begin
  if not _is_anon
     and not exists (select 1 from public.profiles p where not p.is_anonymous) then
    perform pg_advisory_xact_lock(hashtext('public.handle_new_user:founder'));
    -- Re-check under the lock: a concurrent first signup may have committed.
    _founder := not exists (select 1 from public.profiles p where not p.is_anonymous);
  end if;

  insert into public.profiles (id, display_name, avatar_url, is_anonymous, is_staff, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    _is_anon,
    -- First NON-anonymous profile becomes staff (the founder/admin); anon never.
    _founder,
    nullif(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
