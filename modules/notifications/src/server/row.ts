/**
 * Pure mapping from notify() input to a mod_notifications row. Kept apart from
 * ./index (which is `server-only`) so it can be unit-tested.
 */
import type { Json, TablesInsert } from "@acme/api";

import type {
  NotificationChannel,
  NotificationEntity,
  NotificationPayload,
} from "../contract";
import { isSafeNotificationUrl } from "../contract";

export interface NotifyInput {
  userId: string;
  /**
   * The registered category key (`client-portal.case.reply`). Preferred over
   * `type`, which is kept for producers written before 1.1.
   */
  category?: string;
  /** Legacy name for the category; defaults to `category`. */
  type?: string;
  title?: string;
  body?: string;
  /** Click-through target: an app path ("/a/…") or an https URL. */
  url?: string;
  /** The record the notification is about. */
  entity?: NotificationEntity;
  /** The user whose action caused it. */
  actorId?: string;
  /** Channels to deliver on; omitted = the category's defaults. */
  channels?: NotificationChannel[];
  /** Per-channel renderings (email subject/body/reply-to, push overrides). */
  payload?: NotificationPayload;
  /** Stable key; a second notify() with the same key for the user is a no-op. */
  dedupeKey?: string;
  /** Free-form extra data (kept for older readers). */
  data?: Json;
  /** Producer module slug; defaults to the category's first segment. */
  sourceModule?: string;
  /**
   * Set false to skip the Expo push even when the channels allow it
   * (default true). Kept for producers written before 1.1.
   */
  push?: boolean;
}

/** Maps a NotifyInput to a mod_notifications row (pure; unit-tested). */
export function toNotificationRow(
  input: NotifyInput,
): TablesInsert<"mod_notifications"> {
  const category = input.category ?? input.type;
  if (!category) throw new Error("notify: category is required");
  if (input.url !== undefined && !isSafeNotificationUrl(input.url)) {
    throw new Error(`notify: unsafe url ${JSON.stringify(input.url)}`);
  }
  const base: Record<string, Json | undefined> =
    input.data && typeof input.data === "object" && !Array.isArray(input.data)
      ? input.data
      : {};
  return {
    user_id: input.userId,
    type: input.type ?? category,
    category,
    source_module: input.sourceModule ?? category.split(".")[0],
    title: input.title,
    body: input.body,
    url: input.url,
    entity_type: input.entity?.type,
    entity_id: input.entity?.id,
    actor_id: input.actorId,
    channels: input.channels,
    payload: (input.payload ?? {}) as Json,
    dedupe_key: input.dedupeKey,
    data: input.url ? { ...base, url: input.url } : base,
  };
}

/** True when this notification should go out as an Expo push. */
export function wantsPush(input: NotifyInput): boolean {
  if (input.push === false) return false;
  return !input.channels || input.channels.includes("push");
}
