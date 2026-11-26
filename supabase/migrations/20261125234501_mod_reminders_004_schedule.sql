-- Reminders 1.2 · delivered by the app, scheduled by Supabase Cron.
--
-- The `reminders-process` edge function is retired: delivery moved to the
-- module's cron route (GET /api/mod/reminders/cron/process), which Supabase
-- Cron calls every minute through the kit's scheduler with its cron secret.
-- No edge-function deploy or secrets to set.

select public.kit_register_app_schedule(
  'mod-reminders-process',
  '* * * * *',
  '/api/mod/reminders/cron/process'
);
