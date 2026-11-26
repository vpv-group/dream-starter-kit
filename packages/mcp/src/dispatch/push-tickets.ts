import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api/types";

/**
 * Expo push tickets and receipts — the shapes from
 * https://docs.expo.dev/push-notifications/sending-notifications/ — plus the
 * server-only `public.mod_notifications_push_tickets` ledger the dispatcher
 * writes and the `push-receipts` task drains.
 *
 * The ledger is typed locally (not from the generated `Database` type) so this
 * package doesn't depend on a regenerated types file; it is a strict subset of
 * what `pnpm db:gen-types` produces for the table.
 */

/** One entry of `/push/send`'s `data` array, in the order of the messages. */
export type ExpoPushTicket =
  | { status: "ok"; id: string }
  | {
      status: "error";
      message?: string;
      details?: { error?: string; expoPushToken?: string };
    };

/** One entry of `/push/getReceipts`'s `data` map (keyed by ticket id). */
export type ExpoPushReceipt =
  | { status: "ok" }
  | { status: "error"; message?: string; details?: { error?: string } };

/** Expo's error code for a token whose app was uninstalled / unregistered. */
export const DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

// Type aliases, not interfaces: supabase-js's GenericSchema constraint needs
// the implicit index signature a type alias has (see auth/store.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type PushTicketRow = {
  id: string;
  token: string;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type PushTicketsDatabase = {
  public: {
    Tables: {
      mod_notifications_push_tickets: {
        Row: PushTicketRow;
        Insert: { id: string; token: string; created_at?: string };
        Update: Partial<PushTicketRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type PushTicketsClient = SupabaseClient<PushTicketsDatabase, "public">;

/** View the service-role client through the ledger's local type. */
export function ticketsClient(
  admin: SupabaseClient<Database>,
): PushTicketsClient {
  return admin as unknown as PushTicketsClient;
}

/**
 * Keep `.in()` filters short: PostgREST takes them in the query string, and a
 * thousand tokens would make a URL proxies reject.
 */
export const IN_FILTER_CHUNK = 200;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * Delete push tokens Expo reported as no longer registered. Only rows
 * registered at or before `registeredBefore` go: a device that registered
 * again after the failed send keeps its fresh row.
 */
export async function deleteDeadTokens(
  admin: SupabaseClient<Database>,
  tokens: string[],
  registeredBefore: string,
): Promise<number> {
  let removed = 0;
  for (const part of chunk([...new Set(tokens)], IN_FILTER_CHUNK)) {
    const { error, count } = await admin
      .from("mod_notifications_push_tokens")
      .delete({ count: "exact" })
      .in("token", part)
      .lte("created_at", registeredBefore);
    if (error) throw new Error(`push tokens cleanup: ${error.message}`);
    removed += count ?? 0;
  }
  return removed;
}

/** Store ticket ids (and the token each went to) for the receipts check. */
export async function recordPushTickets(
  admin: SupabaseClient<Database>,
  tickets: { id: string; token: string }[],
): Promise<void> {
  if (tickets.length === 0) return;
  const { error } = await ticketsClient(admin)
    .from("mod_notifications_push_tickets")
    .upsert(tickets, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`push tickets: ${error.message}`);
}
