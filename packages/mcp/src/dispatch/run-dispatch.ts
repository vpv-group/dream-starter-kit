import type { SupabaseClient } from "@supabase/supabase-js";
import type { Payload } from "payload";

import type { Database } from "@acme/api/types";

/**
 * Notifications dispatch worker — the piece that actually SENDS scheduled
 * Payload `notifications`. Pure and dependency-injected (payload + service-role
 * Supabase client + fetch) so it unit-tests without a server or real devices.
 *
 * Why both clients: the notifications live in the `cms` schema (Payload), while
 * device tokens + the in-app feed live in `public` (RLS, reached via the
 * service-role client). The in-app dispatch route is the one place that has
 * both, which is why this runs in-app rather than as an edge function.
 *
 * Flow per due notification: claim (status→sending, atomically), resolve the
 * audience, fan out Expo push + insert in-app rows, then write back
 * status/sentAt/sentCount (or status=failed on error).
 *
 * Scale: nothing here reads a whole table through PostgREST (which silently
 * stops at `max_rows`, 1000). In-app rows are inserted by one set-based RPC
 * (`mod_notifications_broadcast`, idempotent per notification), push tokens
 * are paged with a keyset cursor (`mod_notifications_audience_tokens`), and
 * segment/"all" audiences are resolved in SQL — anonymous users excluded.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH = 100;
/** Push tokens fetched per keyset page. */
const TOKEN_PAGE = 1000;

export interface DispatchDeps {
  payload: Payload;
  admin: SupabaseClient<Database>;
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Max notifications to process per run (bounded for serverless). */
  limit?: number;
  expoPushUrl?: string;
  /**
   * Atomically move one notification from `scheduled` to `sending`; resolve
   * true only if THIS call won it. The host passes a single conditional SQL
   * UPDATE so overlapping runs can never both send. The default (Payload
   * Local API, find-then-update) is for tests and non-Postgres adapters.
   */
  claim?: (id: string | number) => Promise<boolean>;
}

export interface DispatchResult {
  processed: number;
  sent: number;
  failed: number;
}

interface NotificationDoc {
  id: string | number;
  title?: string | null;
  body?: string | null;
  channel?: string[] | null;
  audience?: string | null;
  targetUsers?: (string | number | { id: string | number })[] | null;
  segment?: Record<string, unknown> | null;
  deepLink?: string | null;
  data?: Record<string, unknown> | null;
}

/**
 * Who receives a notification. Resolved in SQL by the notifications RPCs, so
 * "all" and tag segments never round-trip a user list through the API.
 */
type Audience =
  | { kind: "all" }
  | { kind: "users"; userIds: string[] }
  | { kind: "tags"; tagNames: string[] };

function audienceArgs(audience: Audience) {
  return {
    _audience: audience.kind,
    _user_ids: audience.kind === "users" ? audience.userIds : undefined,
    _tag_names: audience.kind === "tags" ? audience.tagNames : undefined,
  };
}

function isEmpty(audience: Audience): boolean {
  if (audience.kind === "users") return audience.userIds.length === 0;
  if (audience.kind === "tags") return audience.tagNames.length === 0;
  return false;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

export async function runDispatch(deps: DispatchDeps): Promise<DispatchResult> {
  const { payload, admin } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const expoUrl = deps.expoPushUrl ?? EXPO_PUSH_URL;
  const nowIso = (deps.now ?? new Date()).toISOString();

  const { docs } = await payload.find({
    collection: "notifications",
    where: {
      and: [
        { status: { equals: "scheduled" } },
        { scheduledAt: { less_than_equal: nowIso } },
      ],
    },
    sort: "scheduledAt",
    limit: deps.limit ?? 25,
    depth: 0,
    overrideAccess: true,
  });

  let sent = 0;
  let failed = 0;

  for (const raw of docs as NotificationDoc[]) {
    const id = raw.id;
    try {
      // Claim the row so overlapping cron runs don't double-send. Losing the
      // race is not a failure: another run is sending it.
      const claimed = await (deps.claim ?? defaultClaim(payload))(id);
      if (!claimed) continue;

      const channels = raw.channel ?? ["push"];
      const audience = await resolveAudience(payload, raw);

      let recipientCount = 0;
      if (channels.includes("push")) {
        recipientCount += await sendPush(
          admin,
          fetchImpl,
          expoUrl,
          audience,
          raw,
        );
      }
      if (channels.includes("in_app")) {
        recipientCount += await insertInApp(admin, audience, raw);
      }

      await payload.update({
        collection: "notifications",
        id,
        data: {
          status: "sent",
          sentAt: new Date().toISOString(),
          sentCount: recipientCount,
        },
        overrideAccess: true,
      });
      sent++;
    } catch (err) {
      failed++;
      await payload
        .update({
          collection: "notifications",
          id,
          data: { status: "failed" },
          overrideAccess: true,
        })
        .catch(() => {
          /* best effort — the next run will not retry a 'failed' row */
        });
      payload.logger.error(
        `notifications dispatch: ${id} failed — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return { processed: docs.length, sent, failed };
}

/**
 * Fallback claim via the Local API: a conditional bulk update that only
 * touches the row while it is still `scheduled`. Not atomic across processes
 * (Payload finds, then updates) — the host injects a single-statement SQL
 * claim instead.
 */
function defaultClaim(payload: Payload) {
  return async (id: string | number): Promise<boolean> => {
    const res = (await payload.update({
      collection: "notifications",
      where: {
        and: [{ id: { equals: id } }, { status: { equals: "scheduled" } }],
      },
      data: { status: "sending" },
      overrideAccess: true,
    })) as { docs?: unknown[] };
    return (res.docs?.length ?? 0) > 0;
  };
}

// --- Audience resolution ------------------------------------------------------

async function resolveAudience(
  payload: Payload,
  notif: NotificationDoc,
): Promise<Audience> {
  const audience = notif.audience ?? "all";
  if (audience === "all") return { kind: "all" };

  if (audience === "users") {
    // targetUsers are CMS user ids; map them to Supabase user ids via the
    // cms.users.supabaseUserId field (that is the key into public device tokens
    // and the in-app feed). Staff pick these by hand, so the list is small.
    const cmsIds = (notif.targetUsers ?? []).map((u) =>
      typeof u === "object" ? u.id : u,
    );
    if (cmsIds.length === 0) return { kind: "users", userIds: [] };
    const { docs } = await payload.find({
      collection: "users",
      where: { id: { in: cmsIds } },
      limit: cmsIds.length,
      depth: 0,
      overrideAccess: true,
    });
    const userIds = (docs as { supabaseUserId?: string | null }[])
      .map((d) => d.supabaseUserId)
      .filter((v): v is string => typeof v === "string");
    return { kind: "users", userIds };
  }

  // segment: tag-name filter — { tags: ["Pro"] } → users carrying any of them.
  const segment = notif.segment ?? {};
  const rawTags = (segment as { tags?: unknown }).tags;
  const tagNames = Array.isArray(rawTags)
    ? rawTags.filter((t): t is string => typeof t === "string")
    : [];
  return { kind: "tags", tagNames };
}

// --- Delivery -----------------------------------------------------------------

async function sendPush(
  admin: SupabaseClient<Database>,
  fetchImpl: typeof fetch,
  expoUrl: string,
  audience: Audience,
  notif: NotificationDoc,
): Promise<number> {
  if (isEmpty(audience)) return 0;

  let sentTo = 0;
  let after: string | undefined;
  for (;;) {
    const { data: page, error } = await admin.rpc(
      "mod_notifications_audience_tokens",
      { ...audienceArgs(audience), _after: after, _limit: TOKEN_PAGE },
    );
    if (error) throw new Error(`push tokens: ${error.message}`);
    if (page.length === 0) break;

    for (const batch of chunk(page, EXPO_BATCH)) {
      const res = await fetchImpl(expoUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          batch.map((t) => ({
            to: t.token,
            title: notif.title ?? "Notification",
            body: notif.body ?? "",
            data: { ...(notif.data ?? {}), deepLink: notif.deepLink ?? null },
            sound: "default",
          })),
        ),
      });
      if (!res.ok) throw new Error(`Expo push failed: HTTP ${res.status}`);
      sentTo += batch.length;
    }

    if (page.length < TOKEN_PAGE) break;
    after = page[page.length - 1]?.id;
  }
  return sentTo;
}

async function insertInApp(
  admin: SupabaseClient<Database>,
  audience: Audience,
  notif: NotificationDoc,
): Promise<number> {
  if (isEmpty(audience)) return 0;
  // One statement for the whole audience; the dedupe key makes a retried
  // dispatch of the same notification insert nothing twice.
  const { data, error } = await admin.rpc("mod_notifications_broadcast", {
    _dedupe_key: `broadcast:${notif.id}`,
    _category: "announcement",
    _title: notif.title ?? "Notification",
    _body: notif.body ?? undefined,
    _data: { ...(notif.data ?? {}), deepLink: notif.deepLink ?? null },
    _source_module: "kit",
    ...audienceArgs(audience),
  });
  if (error) throw new Error(`in-app broadcast: ${error.message}`);
  return data;
}
