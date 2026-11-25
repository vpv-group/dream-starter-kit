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
  {
    slug: "account-erasure",
    label: "Erase a deleted account's data outside public",
    // IDs only (never PII) in job input — jobs are stored in cms.payload_jobs.
    inputSchema: [{ name: "supabaseUserId", type: "text", required: true }],
    retries: { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
    handler: async ({ input, req }) => {
      const { eraseAccountOutsidePublic } =
        await import("../../lib/account/erasure");
      const { supabaseUserId } = input as { supabaseUserId: string };
      const result = await eraseAccountOutsidePublic(
        req.payload,
        supabaseUserId,
      );
      return { output: { ...result } };
    },
  },
  {
    slug: "favorites-cleanup",
    label: "Remove favorites of deleted content",
    inputSchema: [
      { name: "collection", type: "text", required: true },
      { name: "itemId", type: "text", required: true },
    ],
    retries: { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
    handler: async ({ input }) => {
      const { collection, itemId } = input as {
        collection: string;
        itemId: string;
      };
      const { createAdminClient } = await import("../../lib/supabase/admin");
      const { error, count } = await createAdminClient()
        .from("content_favorites")
        .delete({ count: "exact" })
        .eq("collection", collection)
        .eq("item_id", itemId);
      if (error) throw new Error(`favorites cleanup: ${error.message}`);
      return { output: { removed: count ?? 0 } };
    },
  },
  {
    slug: "cms-user-sync",
    label: "Mirror changed profiles into CMS users",
    // Drains the `cms_user_sync` Supabase Queue that a trigger on
    // public.profiles fills (supabase/migrations/*_cms_user_sync_queue.sql).
    schedule: [{ cron: "* * * * *", queue: "default" }],
    handler: async () => {
      const [{ createAdminClient }, { ensureCmsUser, ensureFreeTag }] =
        await Promise.all([
          import("../../lib/supabase/admin"),
          import("../../lib/cms/mirror-user"),
        ]);
      const admin = createAdminClient();
      const { data: messages, error } = await admin.rpc("cms_user_sync_read", {
        _n: 100,
        _vt: 120,
      });
      if (error) throw new Error(`cms_user_sync read: ${error.message}`);

      // One mirror per user, however many changes queued up for them.
      const msgIdsByUser = new Map<string, number[]>();
      for (const m of messages) {
        msgIdsByUser.set(m.user_id, [
          ...(msgIdsByUser.get(m.user_id) ?? []),
          m.msg_id,
        ]);
      }

      const acked: number[] = [];
      let failed = 0;
      for (const [userId, msgIds] of msgIdsByUser) {
        const { data } = await admin.auth.admin.getUserById(userId);
        const user = data.user;
        // Deleted since it was queued: nothing to mirror.
        if (!user || user.is_anonymous) {
          acked.push(...msgIds);
          continue;
        }
        const { data: profile } = await admin
          .from("profiles")
          .select("display_name, phone, title")
          .eq("id", userId)
          .maybeSingle();
        const ok = await ensureCmsUser({
          id: user.id,
          email: user.email,
          name: profile?.display_name ?? undefined,
          metadata: user.user_metadata,
          syncProfile: profile
            ? {
                displayName: profile.display_name,
                phone: profile.phone,
                jobTitle: profile.title,
              }
            : undefined,
        });
        if (ok) {
          await ensureFreeTag(userId);
          acked.push(...msgIds);
        } else {
          // Left unacknowledged: pgmq redelivers it after the timeout.
          failed++;
        }
      }
      if (acked.length > 0) {
        await admin.rpc("cms_user_sync_ack", { _msg_ids: acked });
      }
      return { output: { users: msgIdsByUser.size, failed } };
    },
  },
];
