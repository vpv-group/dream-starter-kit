-- cms.users mirror: a durable queue instead of a mirror call on every render.
--
-- `cms.users` must list every permanent user (docs: CLAUDE.md → CMS auth).
-- The mirror used to run from five request paths plus a backstop in the app
-- shell layout (one Payload query per authenticated page render), and a missed
-- call was only repaired by running `pnpm cms:backfill-users` by hand.
--
-- Now a trigger on public.profiles enqueues the user id on Supabase Queues
-- (pgmq, available on every plan) whenever a permanent profile is created or
-- a mirrored field changes. The `cms-user-sync` Payload task drains the queue
-- every minute. pgmq is at-least-once (a message read but not acknowledged
-- reappears after its visibility timeout), so the drain is idempotent.
-- Messages carry the user id only — never PII.
--
-- The queue isn't exposed through the Data API; server code reads it through
-- two service-role-only RPCs.
--
-- Append-only + idempotent-friendly.

create extension if not exists pgmq;

do $$
begin
  if not exists (select 1 from pgmq.list_queues() q where q.queue_name = 'cms_user_sync') then
    perform pgmq.create('cms_user_sync');
  end if;
end;
$$;

create or replace function private.enqueue_cms_user_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_anonymous then
    return new;
  end if;
  -- Never block the profile write over bookkeeping.
  begin
    perform pgmq.send('cms_user_sync', jsonb_build_object('user_id', new.id));
  exception when others then
    raise warning 'cms_user_sync: enqueue failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists profiles_enqueue_cms_sync on public.profiles;
create trigger profiles_enqueue_cms_sync
  after insert or update of email, display_name, avatar_url, phone, title, is_staff, is_anonymous
  on public.profiles
  for each row execute function private.enqueue_cms_user_sync();

-- Read up to _n messages, hidden from other readers for _vt seconds.
create or replace function public.cms_user_sync_read(_n integer default 100, _vt integer default 120)
returns table (msg_id bigint, user_id uuid, read_ct integer)
language sql
security definer
set search_path = ''
as $$
  select m.msg_id, (m.message ->> 'user_id')::uuid, m.read_ct
  from pgmq.read('cms_user_sync', greatest(coalesce(_vt, 120), 10), least(greatest(coalesce(_n, 100), 1), 500)) m;
$$;

-- Acknowledge processed messages (delete, not archive: nothing to keep).
create or replace function public.cms_user_sync_ack(_msg_ids bigint[])
returns integer
language sql
security definer
set search_path = ''
as $$
  select count(*)::integer from pgmq.delete('cms_user_sync', _msg_ids);
$$;

-- Enqueue every permanent user (the `pnpm cms:backfill-users` catch-up).
create or replace function public.cms_user_sync_enqueue_all()
returns integer
language sql
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.profiles p,
       lateral pgmq.send('cms_user_sync', jsonb_build_object('user_id', p.id))
  where not p.is_anonymous;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.cms_user_sync_read(integer, integer)',
    'public.cms_user_sync_ack(bigint[])',
    'public.cms_user_sync_enqueue_all()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
