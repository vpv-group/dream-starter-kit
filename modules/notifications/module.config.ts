import { defineModule } from "@acme/mod-kit";

/**
 * Notifications — the kit's shared notification service. Other modules
 * PRODUCE notifications through its contract; this module DELIVERS them
 * (today: in-app feed + Expo push; later: email, web push, preferences).
 *
 * Producers `require` it and use:
 *   - TypeScript: `notify()` from `@acme/mod-notifications/server`;
 *   - SQL (triggers, definer functions, edge functions):
 *     `mod_notifications_emit(...)`;
 *   - registration: `mod_notifications_register_category(...)` from their
 *     migrations, `mod_notifications_unregister_module(...)` from drop.sql.
 * See README.md → Producer contract.
 */
export default defineModule({
  slug: "notifications",
  name: "Notifications",
  version: "1.4.0",
  kitCompat: ">=2.3.0 <3",
  description:
    "In-app notification feed and Expo push delivery — the shared service other modules build on.",
  nav: {
    web: [
      {
        title: "Notifications",
        href: "/a/notifications",
        icon: "IconBell",
        order: 40,
      },
    ],
    native: [
      {
        title: "Notifications",
        href: "/a/notifications",
        icon: "IconBell",
        order: 40,
      },
    ],
  },
  routes: {
    web: [{ path: "", component: "NotificationsPage" }],
    native: [{ path: "", component: "NotificationsScreen" }],
  },
  widgets: { web: "NotificationsWidget", native: "NotificationsWidget" },
  server: {
    routes: true,
  },
  database: {
    tables: [
      "mod_notifications",
      "mod_notifications_push_tokens",
      "mod_notifications_push_tickets",
      "mod_notifications_categories",
    ],
  },
});
