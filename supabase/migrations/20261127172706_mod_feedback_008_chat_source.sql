-- Feedback module · feedback from AI chat (folds in the former
-- feedback-source-chat module).
--
-- One row: how far the scan has read the chat module's messages. Server-only
-- (the cron uses the service role); RLS is on with no policies. The chat
-- module is optional: when it isn't installed, the scan reports
-- "chat not installed" and does nothing.

create table if not exists public.mod_feedback_chat_scan_state (
  id smallint primary key default 1 check (id = 1),
  cursor timestamptz not null,
  scanned integer not null default 0,
  forwarded integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.mod_feedback_chat_scan_state enable row level security;

-- Every 15 minutes (the route does nothing unless Settings → Chat is on).
select public.kit_register_app_schedule(
  'mod-feedback-chat-scan',
  '*/15 * * * *',
  '/api/mod/feedback/cron/chat-scan'
);
