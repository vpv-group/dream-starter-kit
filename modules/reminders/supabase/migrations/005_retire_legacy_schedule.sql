-- Reminders 1.2.1 · retire the edge-function schedule from older installs.
--
-- Before 1.2, reminders were delivered by the `reminders-process` edge
-- function, and the docs had installs schedule it with pg_cron under the job
-- name 'reminders-process'. Delivery now runs in the app
-- (mod-reminders-process, 004_schedule.sql); a leftover job would keep
-- calling the old function, which reads pending reminders WITHOUT the claim
-- and could send them twice. Remove it (no-op where it never existed). The
-- deployed function itself can be deleted with
-- `supabase functions delete reminders-process`.

select public.kit_unregister_app_schedule('reminders-process');
