-- Teardown for `pnpm mod remove reminders` (skipped with --keep-data).
drop table if exists public.mod_reminders cascade;
