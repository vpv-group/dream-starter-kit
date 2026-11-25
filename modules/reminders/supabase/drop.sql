-- Teardown for `pnpm mod remove reminders` (skipped with --keep-data).
drop function if exists public.mod_reminders_claim(integer, interval);
drop table if exists public.mod_reminders cascade;
