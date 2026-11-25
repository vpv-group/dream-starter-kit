-- Teardown for `pnpm mod remove reminders` (skipped with --keep-data).
select public.kit_unregister_app_schedule('mod-reminders-process');
drop function if exists public.mod_reminders_claim(integer, interval);
drop table if exists public.mod_reminders cascade;
