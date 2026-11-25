import { defineModule } from "@acme/mod-kit";

/**
 * Reminders — scheduled nudges. Supabase Cron calls the module's public cron
 * route (`GET /api/mod/reminders/cron/process`, registered by
 * supabase/migrations/004_schedule.sql) every minute; it claims due reminders
 * and delivers them through the notifications module's `notify()` service
 * (declared below via requires + database.dml).
 */
export default defineModule({
  slug: "reminders",
  name: "Reminders",
  version: "1.2.0",
  kitCompat: ">=2.0.0 <3",
  description: "Scheduled reminders with push + in-app delivery.",
  requires: ["notifications"],
  nav: {
    web: [
      {
        title: "Reminders",
        href: "/a/reminders",
        icon: "IconClock",
        order: 30,
      },
    ],
    native: [
      {
        title: "Reminders",
        href: "/a/reminders",
        icon: "IconClock",
        order: 30,
      },
    ],
  },
  routes: {
    web: [{ path: "", component: "RemindersPage" }],
    native: [{ path: "", component: "RemindersScreen" }],
  },
  database: {
    tables: ["mod_reminders"],
    dml: ["mod_notifications", "mod_notifications_push_tokens"],
  },
  widgets: { web: "RemindersWidget", native: "RemindersWidget" },
  server: {
    publicRoutes: true,
  },
});
