-- Feedback from Chat · scan cursor.
--
-- One row: how far the scan has read mod_chat_messages. Server-only (the
-- cron uses the service role); RLS is on with no policies, so clients see
-- nothing.

create table if not exists public.mod_feedback_source_chat_state (
  id smallint primary key default 1 check (id = 1),
  cursor timestamptz not null,
  scanned integer not null default 0,
  forwarded integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.mod_feedback_source_chat_state enable row level security;

-- Every 15 minutes.
select public.kit_register_app_schedule(
  'mod-feedback-source-chat-scan',
  '*/15 * * * *',
  '/api/mod/feedback-source-chat/cron/scan'
);
