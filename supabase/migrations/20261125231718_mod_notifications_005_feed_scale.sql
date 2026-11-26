-- Notifications 1.3 · feed reads that stay fast as history grows.
--
-- * The feed used to fetch EVERY notification and count unread ones in the
--   client. It now reads one page (newest first, keyset on created_at, id)
--   and asks mod_notifications_unread_count(), served by a partial index that
--   only holds unread rows.
-- * mod_notifications_mark_all_read() marks the caller's feed read in one
--   statement.
-- * (user_id) is a prefix of (user_id, created_at desc) — dropped.
-- * actor_id is a SET NULL FK to profiles — indexed for profile deletes.
--
-- Both RPCs run as the caller (security invoker), so RLS still applies and
-- they also filter to the caller explicitly.
--
-- Reattach-friendly (if not exists / if exists / or replace).

drop index if exists public.mod_notifications_user_id_idx;
drop index if exists public.ext_notifications_user_id_idx;

create index if not exists mod_notifications_unread_idx
  on public.mod_notifications (user_id)
  where read_at is null;

create index if not exists mod_notifications_actor_idx
  on public.mod_notifications (actor_id)
  where actor_id is not null;

create or replace function public.mod_notifications_unread_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.mod_notifications n
  where n.user_id = (select auth.uid())
    and n.read_at is null;
$$;

create or replace function public.mod_notifications_mark_all_read()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _updated integer;
begin
  update public.mod_notifications n
     set read_at = now()
   where n.user_id = (select auth.uid())
     and n.read_at is null;
  get diagnostics _updated = row_count;
  return _updated;
end;
$$;
