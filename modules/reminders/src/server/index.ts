import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";
import type { ModPublicRouteTable } from "@acme/mod-kit/server";
import { isCronRequest } from "@acme/mod-kit/cron";
import { notify } from "@acme/mod-notifications/server";

/** Reminders delivered per run (Supabase Cron calls this every minute). */
const BATCH = 100;

function serviceClient(): SupabaseClient<Database> {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // SUPABASE_SECRET_KEY: Vercel's Supabase Marketplace name for it.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    "";
  if (!url || !key) {
    throw new Error("reminders: SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface ProcessResult {
  claimed: number;
  sent: number;
  failed: number;
}

/**
 * Deliver due reminders: claim a bounded batch (`for update skip locked`, so
 * overlapping runs never share a reminder), notify each owner through the
 * notifications module (in-app + push), then mark the batch sent. A crash
 * leaves rows 'processing'; the claim re-offers them after 10 minutes (up to
 * 5 attempts). The dedupe key makes a retried delivery a no-op.
 */
export async function processDueReminders(
  db: SupabaseClient<Database>,
  notifyImpl: typeof notify = notify,
): Promise<ProcessResult> {
  const { data: claimed, error } = await db.rpc("mod_reminders_claim", {
    _limit: BATCH,
  });
  if (error) throw new Error(`reminders claim: ${error.message}`);

  const sentIds: string[] = [];
  let failed = 0;
  for (const reminder of claimed) {
    try {
      await notifyImpl(db, {
        userId: reminder.user_id,
        category: "reminders.due",
        title: "Reminder",
        body: "You have a reminder due.",
        url: "/a/reminders",
        channels: reminder.channel === "push" ? ["in_app", "push"] : ["in_app"],
        dedupeKey: `reminder:${reminder.id}`,
        sourceModule: "reminders",
      });
      sentIds.push(reminder.id);
    } catch {
      // Left 'processing': the claim re-offers it after the stale window.
      failed++;
    }
  }

  if (sentIds.length > 0) {
    const { error: markError } = await db
      .from("mod_reminders")
      .update({ status: "sent" })
      .in("id", sentIds);
    if (markError) throw new Error(`reminders mark sent: ${markError.message}`);
  }
  return { claimed: claimed.length, sent: sentIds.length, failed };
}

/**
 * Public (session-less) routes, served at /api/mod/reminders/*. The cron
 * route is called by Supabase Cron every minute (registered in
 * supabase/migrations/004_schedule.sql) with the kit's cron bearer secret.
 */
export const publicRoutes: ModPublicRouteTable = {
  "GET /cron/process": async (req) => {
    if (!isCronRequest(req)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await processDueReminders(serviceClient());
    return Response.json(result);
  },
};
