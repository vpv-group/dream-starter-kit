-- Reminders 1.1 · safe, bounded delivery.
--
-- The processor used to select EVERY due reminder (no limit, silently capped
-- at PostgREST's max_rows), deliver them one by one, and mark them sent
-- afterwards — two overlapping runs sent everything twice, and a crash left
-- nothing to retry. mod_reminders_claim() hands out a bounded batch with
-- `for update skip locked`, marks it 'processing', and re-offers rows a
-- crashed worker left behind (up to 5 attempts). It refuses signed-in and
-- anonymous callers (module SQL can't GRANT/REVOKE, so it checks itself).
--
-- Reattach-friendly (if not exists / drop-then-create / or replace).

alter table public.mod_reminders
  add column if not exists attempts integer not null default 0,
  add column if not exists claimed_at timestamptz;

-- Allow the new 'processing' state. The inline check's name depends on
-- whether the table predates the ext_ → mod_ rename.
alter table public.mod_reminders drop constraint if exists ext_reminders_status_check;
alter table public.mod_reminders drop constraint if exists mod_reminders_status_check;
alter table public.mod_reminders
  add constraint mod_reminders_status_check
  check (status in ('pending', 'processing', 'sent', 'canceled'));

-- The scheduler only ever looks at due pending rows and stuck claims, so
-- partial indexes keep both scans small no matter how much history builds up.
drop index if exists public.mod_reminders_status_due_at_idx;
drop index if exists public.ext_reminders_status_due_at_idx;
create index if not exists mod_reminders_pending_due_idx
  on public.mod_reminders (due_at)
  where status = 'pending';
create index if not exists mod_reminders_processing_claimed_idx
  on public.mod_reminders (claimed_at)
  where status = 'processing';

create or replace function public.mod_reminders_claim(
  _limit integer default 100,
  _stale_after interval default interval '10 minutes'
)
returns table (id uuid, user_id uuid, channel text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_reminders_claim: not allowed' using errcode = '42501';
  end if;
  return query
    update public.mod_reminders r
       set status = 'processing',
           claimed_at = now(),
           attempts = r.attempts + 1
     where r.id in (
       select c.id
       from public.mod_reminders c
       where (c.status = 'pending' and c.due_at <= now())
          or (c.status = 'processing'
              and c.claimed_at < now() - _stale_after
              and c.attempts < 5)
       order by c.due_at
       for update skip locked
       limit least(greatest(coalesce(_limit, 100), 1), 1000)
     )
    returning r.id, r.user_id, r.channel, r.attempts;
end;
$$;
