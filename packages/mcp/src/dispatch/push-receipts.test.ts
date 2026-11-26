import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@acme/api/types";

import { makeFakeTables } from "./fake-tables";
import { runPushReceipts } from "./push-receipts";

/**
 * The receipts check against an in-memory ticket/token store and a fake
 * Expo — no database, no network.
 */

const NOW = new Date("2026-06-02T12:00:00.000Z");
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

function setup(
  tickets: { id: string; token: string; created_at: string }[],
  tokens: { token: string; created_at: string }[],
) {
  const store = makeFakeTables({
    mod_notifications_push_tickets: tickets,
    mod_notifications_push_tokens: tokens.map((t, i) => ({ id: `${i}`, ...t })),
  });
  const admin = { from: store.from } as unknown as SupabaseClient<Database>;
  return { store, admin };
}

/** Fake Expo: answers each requested id from `receipts` (absent = no receipt). */
function expoReceipts(receipts: Record<string, unknown>) {
  const requested: string[][] = [];
  const fetchImpl = vi.fn(
    (_url: string | URL | Request, init?: RequestInit) => {
      const { ids } = JSON.parse(init?.body as string) as { ids: string[] };
      requested.push(ids);
      const data = Object.fromEntries(
        ids.filter((id) => id in receipts).map((id) => [id, receipts[id]]),
      );
      return Promise.resolve(
        new Response(JSON.stringify({ data }), { status: 200 }),
      );
    },
  );
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requested };
}

describe("runPushReceipts", () => {
  it("removes DeviceNotRegistered tokens and deletes processed tickets", async () => {
    const { store, admin } = setup(
      [
        { id: "t-ok", token: "Live", created_at: minutesAgo(30) },
        { id: "t-dead", token: "Gone", created_at: minutesAgo(30) },
        { id: "t-other", token: "Busy", created_at: minutesAgo(30) },
        { id: "t-missing", token: "Live", created_at: minutesAgo(40) },
        // Too recent: its receipt may not be ready yet.
        { id: "t-new", token: "Live", created_at: minutesAgo(5) },
      ],
      [
        { token: "Live", created_at: minutesAgo(60) },
        { token: "Gone", created_at: minutesAgo(60) },
        { token: "Busy", created_at: minutesAgo(60) },
      ],
    );
    const { fetchImpl, requested } = expoReceipts({
      "t-ok": { status: "ok" },
      "t-dead": {
        status: "error",
        message: "not registered",
        details: { error: "DeviceNotRegistered" },
      },
      "t-other": {
        status: "error",
        message: "rate",
        details: { error: "MessageRateExceeded" },
      },
    });

    const result = await runPushReceipts({ admin, fetchImpl, now: NOW });

    expect(result).toEqual({
      checked: 4,
      errors: 2,
      removedTokens: 1,
      expired: 0,
    });
    // Oldest first, only tickets older than 15 minutes.
    expect(requested).toEqual([["t-missing", "t-ok", "t-dead", "t-other"]]);
    expect(
      store.tables.mod_notifications_push_tokens?.map((t) => t.token),
    ).toEqual(["Live", "Busy"]);
    expect(
      store.tables.mod_notifications_push_tickets?.map((t) => t.id),
    ).toEqual(["t-new"]);
  });

  it("keeps a token the device registered again after the failed send", async () => {
    const { store, admin } = setup(
      [{ id: "t-dead", token: "Again", created_at: minutesAgo(30) }],
      [{ token: "Again", created_at: minutesAgo(10) }],
    );
    const { fetchImpl } = expoReceipts({
      "t-dead": { status: "error", details: { error: "DeviceNotRegistered" } },
    });

    const result = await runPushReceipts({ admin, fetchImpl, now: NOW });

    expect(result.removedTokens).toBe(0);
    expect(store.tables.mod_notifications_push_tokens).toHaveLength(1);
    expect(store.tables.mod_notifications_push_tickets).toHaveLength(0);
  });

  it("deletes tickets older than 24 hours without asking Expo", async () => {
    const { store, admin } = setup(
      [
        { id: "t-old", token: "A", created_at: minutesAgo(25 * 60) },
        { id: "t-older", token: "B", created_at: minutesAgo(48 * 60) },
      ],
      [],
    );
    const { fetchImpl } = expoReceipts({});

    const result = await runPushReceipts({ admin, fetchImpl, now: NOW });

    expect(result).toEqual({
      checked: 0,
      errors: 0,
      removedTokens: 0,
      expired: 2,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.tables.mod_notifications_push_tickets).toHaveLength(0);
  });

  it("requests receipts in batches", async () => {
    const tickets = Array.from({ length: 5 }, (_, i) => ({
      id: `t-${i}`,
      token: `Tok${i}`,
      created_at: minutesAgo(60 - i),
    }));
    const { store, admin } = setup(tickets, []);
    const { fetchImpl, requested } = expoReceipts({});

    const result = await runPushReceipts({
      admin,
      fetchImpl,
      now: NOW,
      batchSize: 2,
    });

    expect(requested).toEqual([["t-0", "t-1"], ["t-2", "t-3"], ["t-4"]]);
    expect(result.checked).toBe(5);
    expect(store.tables.mod_notifications_push_tickets).toHaveLength(0);
  });

  it("stops after maxBatches and leaves the rest for the next run", async () => {
    const tickets = Array.from({ length: 5 }, (_, i) => ({
      id: `t-${i}`,
      token: `Tok${i}`,
      created_at: minutesAgo(60 - i),
    }));
    const { store, admin } = setup(tickets, []);
    const { fetchImpl } = expoReceipts({});

    const result = await runPushReceipts({
      admin,
      fetchImpl,
      now: NOW,
      batchSize: 2,
      maxBatches: 1,
    });

    expect(result.checked).toBe(2);
    expect(store.tables.mod_notifications_push_tickets).toHaveLength(3);
  });

  it("throws (so the task retries) and keeps tickets when Expo fails", async () => {
    const { store, admin } = setup(
      [{ id: "t-1", token: "A", created_at: minutesAgo(30) }],
      [],
    );
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response("", { status: 502 })),
    ) as unknown as typeof fetch;

    await expect(
      runPushReceipts({ admin, fetchImpl, now: NOW }),
    ).rejects.toThrow("HTTP 502");
    expect(store.tables.mod_notifications_push_tickets).toHaveLength(1);
  });
});
