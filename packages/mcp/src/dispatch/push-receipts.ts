import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api/types";

import type { ExpoPushReceipt } from "./push-tickets";
import {
  chunk,
  deleteDeadTokens,
  DEVICE_NOT_REGISTERED,
  IN_FILTER_CHUNK,
  ticketsClient,
} from "./push-tickets";

/**
 * Push receipts check — run by the `push-receipts` Payload task every 15
 * minutes. Pure and dependency-injected (service-role client + fetch) so it
 * unit-tests without a database or Expo.
 *
 * Expo's push ticket only says a message was accepted; whether the device
 * could be reached comes in a receipt, available ~15 minutes later and kept
 * for 24 hours (https://docs.expo.dev/push-notifications/sending-notifications/).
 * The dispatcher stores each ticket id with its token in the server-only
 * `public.mod_notifications_push_tickets`. This:
 *   1. deletes tickets older than 24 hours (their receipts are gone);
 *   2. fetches receipts (≤1000 ids per request) for tickets older than 15
 *      minutes, oldest first;
 *   3. deletes the push tokens whose receipt is `DeviceNotRegistered` (only
 *      rows registered before the ticket — a device that registered again
 *      keeps its fresh row);
 *   4. deletes the processed tickets — including ones Expo returned no
 *      receipt for, which after 15 minutes Expo says won't arrive.
 */

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo accepts at most 1000 receipt ids per request. */
const RECEIPTS_BATCH = 1000;
/** Wait this long after a send before asking for its receipt. */
export const RECEIPT_DELAY_MS = 15 * 60 * 1000;
/** Expo keeps receipts this long. */
export const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
/** Upper bound of receipt requests per run (bounded for serverless). */
const MAX_BATCHES = 20;

export interface PushReceiptsDeps {
  admin: SupabaseClient<Database>;
  fetchImpl?: typeof fetch;
  now?: Date;
  receiptsUrl?: string;
  /** Receipt ids per request (≤1000). */
  batchSize?: number;
  /** Receipt requests per run. */
  maxBatches?: number;
}

export interface PushReceiptsResult {
  /** Tickets whose receipts were requested. */
  checked: number;
  /** Receipts with status `error` (any code). */
  errors: number;
  /** Push token rows removed after DeviceNotRegistered. */
  removedTokens: number;
  /** Tickets older than 24 hours deleted unread. */
  expired: number;
}

export async function runPushReceipts(
  deps: PushReceiptsDeps,
): Promise<PushReceiptsResult> {
  const { admin } = deps;
  const db = ticketsClient(admin);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = deps.receiptsUrl ?? EXPO_RECEIPTS_URL;
  const batchSize = Math.min(deps.batchSize ?? RECEIPTS_BATCH, RECEIPTS_BATCH);
  const maxBatches = deps.maxBatches ?? MAX_BATCHES;
  const now = (deps.now ?? new Date()).getTime();
  const readyBefore = new Date(now - RECEIPT_DELAY_MS).toISOString();
  const expiredBefore = new Date(now - RECEIPT_TTL_MS).toISOString();

  // 1. Receipts older than 24 h no longer exist at Expo.
  const { error: expireError, count: expired } = await db
    .from("mod_notifications_push_tickets")
    .delete({ count: "exact" })
    .lt("created_at", expiredBefore);
  if (expireError) {
    throw new Error(`push tickets expiry: ${expireError.message}`);
  }

  const result: PushReceiptsResult = {
    checked: 0,
    errors: 0,
    removedTokens: 0,
    expired: expired ?? 0,
  };

  for (let i = 0; i < maxBatches; i++) {
    // Processed tickets are deleted below, so the next page is again the
    // oldest ready ones.
    const { data: tickets, error } = await db
      .from("mod_notifications_push_tickets")
      .select("id, token, created_at")
      .lt("created_at", readyBefore)
      .order("created_at", { ascending: true })
      .limit(batchSize);
    if (error) throw new Error(`push tickets: ${error.message}`);
    if (tickets.length === 0) break;

    // 2. Receipts for this page.
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: tickets.map((t) => t.id) }),
    });
    if (!res.ok) throw new Error(`Expo receipts failed: HTTP ${res.status}`);
    const body = (await res.json()) as {
      data?: Record<string, ExpoPushReceipt | undefined>;
    };
    const receipts = body.data ?? {};

    // 3. Tokens of devices that are no longer registered.
    const dead: string[] = [];
    let oldestDead: string | undefined;
    for (const ticket of tickets) {
      const receipt = receipts[ticket.id];
      if (receipt?.status !== "error") continue;
      result.errors++;
      if (receipt.details?.error === DEVICE_NOT_REGISTERED) {
        dead.push(ticket.token);
        if (!oldestDead || ticket.created_at < oldestDead) {
          oldestDead = ticket.created_at;
        }
      }
    }
    if (dead.length > 0 && oldestDead) {
      result.removedTokens += await deleteDeadTokens(admin, dead, oldestDead);
    }

    // 4. Done with these tickets.
    for (const ids of chunk(
      tickets.map((t) => t.id),
      IN_FILTER_CHUNK,
    )) {
      const { error: deleteError } = await db
        .from("mod_notifications_push_tickets")
        .delete()
        .in("id", ids);
      if (deleteError) {
        throw new Error(`push tickets cleanup: ${deleteError.message}`);
      }
    }

    result.checked += tickets.length;
    if (tickets.length < batchSize) break;
  }

  return result;
}
