import { defineModule } from "@acme/mod-kit";

/**
 * Reminders — scheduled nudges. The `reminders-process` edge function (run on
 * a schedule via pg_cron or an external trigger) finds due reminders, then
 * fans out through the notifications module via its documented SQL
 * contract: insert into mod_notifications + read mod_notifications_push_tokens
 * (declared below via requires + database.dml).
 */
export default defineModule({
  slug: "reminders",
  name: "Reminders",
  version: "1.0.0",
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
    edgeFunctions: ["reminders-process"],
  },
});
