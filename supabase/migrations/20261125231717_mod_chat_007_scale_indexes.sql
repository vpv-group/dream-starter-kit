-- AI Chat · index shapes that match the queries.
--
-- * Threads are listed per user, newest first; messages are read per thread
--   in time order. Single-column (user_id) / (thread_id) indexes made Postgres
--   sort every list; the composite indexes return rows already ordered.
-- * Foreign keys that ON DELETE actions follow get an index, so deleting a
--   message or a profile doesn't scan the child table.
-- * The (channel) index had too few distinct values to help any query.
--
-- Reattach-friendly (if not exists / if exists).

create index if not exists mod_chat_threads_user_created_idx
  on public.mod_chat_threads (user_id, created_at desc);
drop index if exists public.mod_chat_threads_user_id_idx;

create index if not exists mod_chat_messages_thread_created_idx
  on public.mod_chat_messages (thread_id, created_at);
drop index if exists public.mod_chat_messages_thread_id_idx;

-- Channel conversations are looked up by (channel, contact_key).
create index if not exists mod_chat_threads_channel_contact_idx
  on public.mod_chat_threads (channel, contact_key)
  where contact_key is not null;
drop index if exists public.mod_chat_threads_channel_idx;

-- FK columns followed by ON DELETE CASCADE / SET NULL.
create index if not exists mod_chat_votes_message_idx
  on public.mod_chat_votes (message_id);
create index if not exists mod_chat_suggestions_user_idx
  on public.mod_chat_suggestions (user_id);
create index if not exists mod_chat_channel_contacts_user_idx
  on public.mod_chat_channel_contacts (user_id)
  where user_id is not null;

-- Dedupe rows are only ever deleted by age.
create index if not exists mod_chat_processed_inbound_received_idx
  on public.mod_chat_processed_inbound (received_at);
