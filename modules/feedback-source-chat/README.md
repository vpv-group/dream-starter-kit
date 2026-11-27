# Feedback from Chat (`@acme/mod-feedback-source-chat`)

Collects product feedback from AI chat conversations (web, mobile and the
chat channel adapters) into the Feedback module's **Autopilot inbox**.
Requires `feedback` and `chat`.

**Off by default.** Turn it on in `/admin` → Modules → Feedback → **Chat**.
Staff will see the matching messages and the sender's email, so mention it
in your privacy policy first.

How it works:

1. Every 15 minutes Supabase Cron calls `GET /api/mod/feedback-source-chat/cron/scan`.
2. The scan reads users' chat messages newer than its cursor
   (`mod_feedback_source_chat_state`, server-only; the first run starts at
   "now", history isn't back-filled) with the service role.
3. A keyword prefilter (`src/server/filter.ts`; editable list and minimum
   length in the settings tab) keeps likely feedback. Anonymous accounts
   and unlinked channel contacts are skipped.
4. Each kept message goes to `ingestFeedback()` with `source: "chat"` and a
   reference to the message and thread. Autopilot then decides whether it
   is feedback, titles it and suggests a matching post; staff accept,
   merge or dismiss it in `/a/feedback` → Inbox.

This is the pattern for any feedback source module: declare
`requires: ["feedback", …]`, read your source, and call `ingestFeedback()`.

Tests: `pnpm test` (prefilter) and `pnpm test:rls` (`tests/rls/scan.test.ts`:
forwarding rules, cursor, server-only state).
