-- Feedback module · staff digest email.
--
-- A daily cron (the route sends weekly digests on Mondays only) emails staff
-- a summary built from mod_feedback_insights plus the inbox queues. Each
-- staff member can opt out; a run row is claimed before sending so a cron
-- retry never sends the same digest twice.

create table if not exists public.mod_feedback_staff_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  digest boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.mod_feedback_staff_prefs enable row level security;

drop policy if exists "mod_feedback_staff_prefs: own, staff" on public.mod_feedback_staff_prefs;
create policy "mod_feedback_staff_prefs: own, staff"
  on public.mod_feedback_staff_prefs for all to authenticated
  using (user_id = (select auth.uid()) and (select public.mod_feedback_is_staff()))
  with check (user_id = (select auth.uid()) and (select public.mod_feedback_is_staff()));

-- One row per sent digest period (e.g. "daily:2026-11-27", "weekly:2026-11-23").
-- Server-only: RLS on, no policies.
create table if not exists public.mod_feedback_digest_runs (
  period_key text primary key,
  recipients integer not null default 0,
  sent_at timestamptz not null default now()
);
alter table public.mod_feedback_digest_runs enable row level security;

select public.kit_register_app_schedule(
  'mod-feedback-digest',
  '17 14 * * *',
  '/api/mod/feedback/cron/digest'
);
