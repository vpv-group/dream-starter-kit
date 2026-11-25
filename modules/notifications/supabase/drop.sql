-- Teardown for `pnpm mod remove notifications` (skipped with --keep-data).
drop function if exists public.mod_notifications_emit(uuid, text, text, text, text, text, text, text[], jsonb, text, uuid, text, jsonb);
drop function if exists public.mod_notifications_register_category(text, text, text, text, text, text[], boolean);
drop function if exists public.mod_notifications_unregister_module(text);
drop table if exists public.mod_notifications_categories cascade;
drop table if exists public.mod_notifications_push_tokens cascade;
drop table if exists public.mod_notifications cascade;
