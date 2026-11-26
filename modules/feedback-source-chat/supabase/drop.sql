-- Feedback from Chat · clean removal.
select public.kit_unregister_app_schedule('mod-feedback-source-chat-scan');
drop table if exists public.mod_feedback_source_chat_state cascade;
