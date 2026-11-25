/**
 * The notifications producer contract (pure, client-safe types + helpers).
 *
 * Producer modules describe WHAT happened and how each channel should render
 * it; this module decides delivery. Today that is the in-app feed plus Expo
 * push. Email, web push and per-user preferences are added here later behind
 * the same shapes, so producers written against this file keep working.
 *
 * SQL producers use `mod_notifications_emit(...)` (003_contract.sql) with the
 * same fields; TypeScript producers use `notify()` from `./server`.
 */

/** Delivery channels a producer may request. */
export const NOTIFICATION_CHANNELS = [
  "in_app",
  "push",
  "web_push",
  "email",
  "sms",
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Who a category is for (shown by a future preferences screen). */
export type NotificationAudience = "client" | "staff" | "everyone";

/** `<module>.<thing>[.<event>]`, e.g. `client-portal.case.reply`. */
export const CATEGORY_KEY_RE = /^[a-z][a-z0-9-]*(\.[a-z0-9_-]+)+$/;

/** How the email channel should render the notification (when it ships). */
export interface EmailPayload {
  subject: string;
  text: string;
  html?: string;
  /**
   * Reply-To address. Producers that accept replies by email (the client
   * portal) put a signed reply address here.
   */
  replyTo?: string;
  /** Threading headers so replies group with earlier mail in mail clients. */
  headers?: {
    messageId?: string;
    inReplyTo?: string;
    references?: string[];
  };
}

/** Overrides for push renderings (title/body default to the notification's). */
export interface PushPayload {
  title?: string;
  body?: string;
  /** Collapses repeated pushes about the same thing on the device. */
  threadId?: string;
}

/** Per-channel renderings, stored in `mod_notifications.payload`. */
export interface NotificationPayload {
  email?: EmailPayload;
  push?: PushPayload;
  webPush?: PushPayload;
}

/** The record a notification is about. */
export interface NotificationEntity {
  type: string;
  id: string;
}

/** A category a producer registers (mirrors `mod_notifications_categories`). */
export interface NotificationCategory {
  key: string;
  label: string;
  description?: string;
  audience?: NotificationAudience;
  defaultChannels?: NotificationChannel[];
  transactional?: boolean;
}

/**
 * Declare a module's categories once, typed, so `notify()` calls can't use a
 * misspelled key. Throws on an invalid key at import time. (SQL producers
 * register the same rows in their migration with
 * `mod_notifications_register_category`.)
 */
export function defineNotificationCategories<
  const T extends Record<string, NotificationCategory>,
>(categories: T): T {
  for (const [name, c] of Object.entries(categories)) {
    if (!CATEGORY_KEY_RE.test(c.key)) {
      throw new Error(
        `notification category ${name}: invalid key "${c.key}" (expected <module>.<thing>[.<event>])`,
      );
    }
  }
  return categories;
}

/**
 * True for click-through targets the feed may follow: an app path ("/a/…")
 * or an https URL. Mirrors the `mod_notifications_url_check` constraint.
 */
export function isSafeNotificationUrl(url: unknown): url is string {
  return typeof url === "string" && /^(\/($|[^/\\])|https:\/\/)/.test(url);
}

/**
 * Where tapping a notification goes: the `url` column, falling back to
 * `data.url` (rows written before 1.1). Null when there is no safe target.
 */
export function notificationHref(n: {
  url?: string | null;
  data?: unknown;
}): string | null {
  if (isSafeNotificationUrl(n.url)) return n.url;
  const data = n.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const legacy = (data as Record<string, unknown>).url;
    if (isSafeNotificationUrl(legacy)) return legacy;
  }
  return null;
}
