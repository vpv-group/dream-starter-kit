import { defineModule } from "@acme/mod-kit";

/**
 * Chat → Feedback source. Every 15 minutes it scans new user messages in the
 * AI chat module (web, mobile and channel adapters alike), keeps the ones that
 * read like product feedback (a keyword prefilter), and hands them to the
 * Feedback module's Autopilot inbox via `ingestFeedback()`. Autopilot then
 * classifies, titles and de-duplicates them; nothing becomes a post until
 * staff accept it. Off by default: turning it on shares chat snippets with
 * staff, so say so in your privacy policy.
 */
export default defineModule({
  slug: "feedback-source-chat",
  name: "Feedback from Chat",
  version: "1.0.0",
  kitCompat: ">=2.5.0 <3",
  description:
    "Collect product feedback from AI chat conversations into the Feedback inbox.",
  requires: ["feedback", "chat"],
  nav: {},
  server: {
    publicRoutes: true,
  },
  database: {
    tables: ["mod_feedback_source_chat_state"],
    dml: ["mod_chat_messages", "mod_chat_threads", "mod_feedback_inbox"],
  },
  cms: {
    // A "Chat" tab on the Feedback settings screen.
    settingsTabFor: "feedback",
    hasMigrations: true,
  },
});
