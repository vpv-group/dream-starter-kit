-- Billing 1.1 · webhook claims, a billing email, and a guarded purge.
--
--   * mod_billing_webhook_events gains a claim: an event is inserted as
--     'processing' BEFORE its side effects run and flipped to 'done' after,
--     so two concurrent deliveries of one event (Stripe redelivers on
--     timeouts) can't both send the guest invite or tag the user. A claim
--     older than five minutes is treated as abandoned (the instance died
--     mid-event) and can be taken over. Existing rows were written after a
--     successful apply, so they default to 'done'.
--   * mod_billing_claim_webhook_event(): the claim as one atomic call.
--   * mod_billing_customers.billing_email: the wallet / checkout email when
--     it differs from the account email. The account (login) email stays the
--     Stripe customer's email; a different Apple Pay / Google Pay address is
--     kept here instead of overwriting it.
--   * mod_billing_purge() refuses signed-in and anonymous callers like every
--     other billing function (it was reachable over PostgREST).
--
-- Expand-only and reattach-friendly (if not exists / or replace). Module SQL
-- can't GRANT/REVOKE, so each function checks its caller.

alter table public.mod_billing_webhook_events
  add column if not exists status text not null default 'done'
    check (status in ('processing', 'done')),
  add column if not exists claimed_at timestamptz;

alter table public.mod_billing_customers
  add column if not exists billing_email text;

-- Claim a Stripe event for processing. Returns:
--   'claimed'   — the caller owns it: run the side effects, then mark it done
--                 (or delete the row on failure so Stripe's retry can run);
--   'duplicate' — already handled: acknowledge without applying;
--   'busy'      — another delivery is processing it right now: answer non-2xx
--                 so Stripe retries later.
create or replace function public.mod_billing_claim_webhook_event(
  _id text,
  _type text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _status text;
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_billing_claim_webhook_event: not allowed' using errcode = '42501';
  end if;
  -- Two passes: a claim released (deleted) between our insert and our read
  -- gets one more insert attempt.
  for _i in 1..2 loop
    insert into public.mod_billing_webhook_events (id, type, status, claimed_at)
    values (_id, _type, 'processing', now())
    on conflict (id) do nothing;
    if found then
      return 'claimed';
    end if;

    -- Take over an abandoned claim (its instance crashed or timed out).
    update public.mod_billing_webhook_events e
      set claimed_at = now(), received_at = now()
    where e.id = _id
      and e.status = 'processing'
      and (e.claimed_at is null or e.claimed_at < now() - interval '5 minutes');
    if found then
      return 'claimed';
    end if;

    select e.status into _status
    from public.mod_billing_webhook_events e
    where e.id = _id;
    if _status = 'done' then
      return 'duplicate';
    end if;
    if _status = 'processing' then
      return 'busy';
    end if;
  end loop;
  return 'busy';
end;
$$;

-- Same body as 003, plus the caller guard.
create or replace function public.mod_billing_purge()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _cutoff timestamptz := private.retention_cutoff('billing_webhook_events');
  _n integer;
begin
  if coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'mod_billing_purge: not allowed' using errcode = '42501';
  end if;
  if _cutoff is null then
    return 0;
  end if;
  delete from public.mod_billing_webhook_events e
  where e.id in (
    select x.id from public.mod_billing_webhook_events x
    where x.received_at < _cutoff
    limit 10000
  );
  get diagnostics _n = row_count;
  return _n;
end;
$$;
