import "server-only";

import type { Payload } from "payload";
import { sql } from "@payloadcms/db-postgres/drizzle";

interface DrizzleExecutor {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }>;
}

/**
 * Atomically claim one due notification for sending: a single conditional
 * UPDATE, so of two overlapping dispatch runs exactly one wins. (Payload's
 * Local API can't express "update only if status is still scheduled"
 * atomically — a bulk update finds first, then updates.)
 *
 * Besides `scheduled` rows it takes over a `sending` row untouched for 10
 * minutes: the run that claimed it crashed mid-send. Claiming bumps
 * `updated_at`, so a recovered row isn't taken over twice. Keep the interval
 * in step with STALE_SENDING_MS in @acme/mcp (dispatch/run-dispatch.ts).
 */
export async function claimScheduledNotification(
  payload: Payload,
  id: string | number,
): Promise<boolean> {
  const db = (payload.db as unknown as { drizzle: DrizzleExecutor }).drizzle;
  const result = await db.execute(sql`
    update "cms"."notifications"
       set "status" = 'sending', "updated_at" = now()
     where "id" = ${id}
       and (
         "status" = 'scheduled'
         or ("status" = 'sending'
             and "updated_at" < now() - interval '10 minutes')
       )
     returning "id"
  `);
  return result.rows.length > 0;
}
