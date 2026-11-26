-- Teardown for `pnpm mod remove notifications` (skipped with --keep-data).
drop function if exists public.mod_notifications_emit(uuid, text, text, text, text, text, text, text[], jsonb, text, uuid, text, jsonb);
drop function if exists public.mod_notifications_register_category(text, text, text, text, text, text[], boolean);
drop function if exists public.mod_notifications_unregister_module(text);
drop function if exists public.mod_notifications_register_push_token(text, text);
drop function if exists public.mod_notifications_unread_count();
drop function if exists public.mod_notifications_push_token_claim() cascade;
drop function if exists public.mod_notifications_mark_all_read();
drop function if exists public.mod_notifications_broadcast(text, text, text, text, text, jsonb, text, uuid[], text[], text);
drop function if exists public.mod_notifications_audience_tokens(text, uuid[], text[], uuid, integer);
drop function if exists public.mod_notifications_audience(text, uuid[], text[]);
drop table if exists public.mod_notifications_categories cascade;
drop table if exists public.mod_notifications_push_tokens cascade;
drop table if exists public.mod_notifications cascade;
