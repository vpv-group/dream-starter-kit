-- Teardown for `pnpm mod remove notifications` (skipped with --keep-data).
drop table if exists public.mod_notifications_push_tokens cascade;
drop table if exists public.mod_notifications cascade;
