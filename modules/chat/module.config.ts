import { defineModule } from "@acme/mod-kit";

/**
 * AI Chat — persisted assistant threads. The streaming endpoint is served by
 * the module dispatcher (POST /api/mod/chat/stream — authed +
 * rate-limited); the model id stays centralized in @acme/config (golden rule
 * #5) while the system prompt + history window are runtime-tunable from the
 * admin settings screen (§1.7).
 */
export default defineModule({
  slug: "chat",
  name: "AI Chat",
  version: "1.1.0",
  kitCompat: ">=2.0.0 <3",
  description: "AI assistant with persisted chat threads.",
  nav: {
    web: [
      { title: "Chat", href: "/a/chat", icon: "IconMessageCircle", order: 20 },
    ],
    native: [
      { title: "Chat", href: "/a/chat", icon: "IconMessageCircle", order: 20 },
    ],
  },
  routes: {
    web: [
      { path: "", component: "ChatListPage" },
      { path: "[threadId]", component: "ChatThreadPage" },
    ],
    native: [
      { path: "", component: "ChatListScreen" },
      { path: "[threadId]", component: "ChatThreadScreen" },
    ],
  },
  widgets: { web: "ChatWidget", native: "ChatWidget" },
  server: {
    routes: true,
  },
  database: {
    tables: [
      "mod_chat_threads",
      "mod_chat_messages",
      "mod_chat_documents",
      "mod_chat_suggestions",
      "mod_chat_votes",
      "mod_chat_channel_contacts",
      // Created in 004, dropped in 005 (threads unified into mod_chat_threads);
      // still declared so the migration DDL passes the table-ownership lint.
      "mod_chat_channel_threads",
      "mod_chat_processed_inbound",
      "mod_chat_outbound_counters",
    ],
  },
  cms: {
    collections: ["mod-chat-skills"],
    hasSettings: true,
    hasMigrations: true,
    hasSeed: true,
  },
});
