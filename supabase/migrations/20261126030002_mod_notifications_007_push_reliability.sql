-- Notifications 1.4 · push reliability.
--
-- 1. mod_notifications_push_tickets — the Expo push ticket ids the dispatcher
--    got back from each send (id + the token it went to; no message content).
--    The `push-receipts` Payload task reads them ~15 minutes later, fetches
--    Expo's receipts, removes tokens whose device is no longer registered
--    (`DeviceNotRegistered`), then deletes the processed tickets. Expo drops
--    receipts after 24 hours, so older tickets are deleted unread.
--    Server-only: RLS on, no policies (only the service role, which bypasses
--    RLS, reads or writes it).
-- 2. mod_notifications_unregister_push_token(_token) — the mobile app calls it
--    on sign-out so a device stops receiving the signed-out account's pushes.
--    Deletes only the caller's own row.
--
-- Append-only + idempotent-friendly.

-- ============================================================================
-- 1. Push tickets (server-only)
-- ============================================================================

create table if not exists public.mod_notifications_push_tickets (
  id text primary key, -- Expo push ticket id (receipt id)
  token text not null, -- the Expo push token the message was sent to
  created_at timestamptz not null default now()
);
create index if not exists mod_notifications_push_tickets_created_idx
  on public.mod_notifications_push_tickets (created_at);

-- Server-only ledger: RLS on, no policies (service role bypasses RLS).
alter table public.mod_notifications_push_tickets enable row level security;

-- ============================================================================
-- 2. Unregister this device on sign-out
-- ============================================================================

create or replace function public.mod_notifications_unregister_push_token(
  _token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.mod_notifications_push_tokens t
  where t.user_id = (select auth.uid())
    and t.token = _token;
end;
$$;
