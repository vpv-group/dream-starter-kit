import { defineModule } from "@acme/mod-kit";

/**
 * Notifications — the kit's shared notification service (in-app feed + Expo
 * push). Other modules `require` it: import its client hooks, the server
 * `notify()` API, or (from Deno edge functions) follow the documented SQL
 * contract — insert into mod_notifications, read mod_notifications_push_tokens.
 */
export default defineModule({
  slug: "notifications",
  name: "Notifications",
  version: "1.0.0",
  kitCompat: ">=1.0.0 <2",
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
    tables: ["mod_notifications", "mod_notifications_push_tokens"],
  },
});
