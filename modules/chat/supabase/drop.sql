-- Teardown for `pnpm mod remove chat` (skipped with --keep-data).
drop table if exists public.mod_chat_outbound_counters cascade;
drop table if exists public.mod_chat_processed_inbound cascade;
drop table if exists public.mod_chat_channel_contacts cascade;
drop table if exists public.mod_chat_votes cascade;
drop table if exists public.mod_chat_suggestions cascade;
drop table if exists public.mod_chat_documents cascade;
drop table if exists public.mod_chat_messages cascade;
drop table if exists public.mod_chat_threads cascade;
