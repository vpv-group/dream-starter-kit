import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";
import type { ModRouteTable } from "@acme/mod-kit/server";

import type { NotifyInput } from "./row";
import { toNotificationRow, wantsPush } from "./row";

export type {
  EmailPayload,
  NotificationAudience,
  NotificationCategory,
  NotificationChannel,
  NotificationEntity,
  NotificationPayload,
  PushPayload,
} from "../contract";
export {
  CATEGORY_KEY_RE,
  defineNotificationCategories,
  isSafeNotificationUrl,
  NOTIFICATION_CHANNELS,
} from "../contract";

export type { NotifyInput } from "./row";
export { toNotificationRow, wantsPush } from "./row";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * The notifications SERVICE: record a notification and deliver it on the
 * channels this module supports today (in-app feed + Expo push). Channels it
 * doesn't deliver yet (email, web push) are stored with their `payload`
 * renderings and go out once those channels ship — producers don't change.
 *
 * `db` is either the caller's RLS-scoped client (self-notifications — RLS
 * permits writing your own rows) or the service-role client (notifying other
 * users). SQL producers use the equivalent `mod_notifications_emit(...)`.
 *
 * Returns the new notification's id, or null when `dedupeKey` was already
 * used for this user (nothing is inserted or pushed again).
 */
export async function notify(
  db: SupabaseClient<Database>,
  input: NotifyInput,
): Promise<string | null> {
  const row = toNotificationRow(input);
  const { data: inserted, error } = await db
    .from("mod_notifications")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (error) {
    // 23505 = unique violation on (user_id, dedupe_key): already notified.
    if (error.code === "23505" && input.dedupeKey) return null;
    throw new Error(`notify: insert failed — ${error.message}`);
  }
  const id = inserted?.id ?? null;
  if (!wantsPush(input)) return id;

  const { data: tokens } = await db
    .from("mod_notifications_push_tokens")
    .select("token")
    .eq("user_id", input.userId);
  if (!tokens || tokens.length === 0) return id;

  const push = input.payload?.push;
  await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      tokens.map((t) => ({
        to: t.token,
        title: push?.title ?? input.title ?? row.category,
        body: push?.body ?? input.body,
        sound: "default",
        ...(push?.threadId ? { threadId: push.threadId } : {}),
        // The app opens this on tap (deep link).
        data: { url: input.url ?? null, notificationId: id },
      })),
    ),
  });
  return id;
}

/**
 * Module API routes, served via the host dispatcher at
 * /api/mod/notifications/* — already authenticated (cookie or Bearer) and
 * rate-limited before a handler runs.
 */
export const routes: ModRouteTable = {
  /** Send a test push to all of the caller's registered devices. */
  "POST /push-test": async (_req, ctx) => {
    const { data: tokens } = await ctx.supabase
      .from("mod_notifications_push_tokens")
      .select("token");
    if (!tokens || tokens.length === 0) {
      return Response.json(
        { error: "No registered devices (open the app on a dev build first)" },
        { status: 404 },
      );
    }

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        tokens.map((t) => ({
          to: t.token,
          title: "Dream",
          body: "🎉 Test notification",
          sound: "default",
        })),
      ),
    });
    const result: unknown = await res.json();

    return Response.json({ sent: tokens.length, result });
  },
};
