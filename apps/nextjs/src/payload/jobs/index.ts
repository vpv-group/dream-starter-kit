import type { TaskConfig } from "payload";

/**
 * Core background work, run by Payload's Jobs Queue.
 *
 * Nothing here schedules itself: Supabase Cron calls
 * `GET /cms-api/payload-jobs/run?allQueues=true` every minute (see
 * supabase/migrations/*_jobs_schedules.sql), and that endpoint first queues
 * every task whose `schedule` is due, then runs a bounded batch. One
 * scheduler, any Vercel plan, retries and history in /admin (Payload Jobs).
 *
 * Handlers import their dependencies lazily so the Payload CLI (which loads
 * this config to generate types/migrations) never pulls in server-only code.
 */
export const coreTasks: TaskConfig[] = [
  {
    slug: "dispatch-notifications",
    label: "Send scheduled notifications",
    // Every minute. A run claims each due notification atomically, so a slow
    // run overlapping the next one can't send anything twice.
    schedule: [{ cron: "* * * * *", queue: "default" }],
    handler: async ({ req }) => {
      const [
        { runDispatch },
        { createAdminClient },
        { claimScheduledNotification },
      ] = await Promise.all([
        import("@acme/mcp"),
        import("../../lib/supabase/admin"),
        import("../../lib/cms/claim-notification"),
      ]);
      const result = await runDispatch({
        payload: req.payload,
        admin: createAdminClient(),
        claim: (id) => claimScheduledNotification(req.payload, id),
      });
      return { output: { ...result } };
    },
  },
  {
    slug: "dream-site-report",
    label: "Report site license (meetdream.com)",
    schedule: [{ cron: "23 5 * * *", queue: "default" }],
    retries: { attempts: 3, backoff: { type: "exponential", delay: 60_000 } },
    handler: async ({ req }) => {
      const { syncDreamSite } = await import("../../lib/dream/site");
      // Slightly under a day so a fixed daily schedule never trips the throttle.
      const result = await syncDreamSite(req.payload, {
        minIntervalMs: 12 * 60 * 60 * 1000,
      });
      return { output: { ...result } };
    },
  },
];
