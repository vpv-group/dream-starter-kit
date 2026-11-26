import type { SupabaseClient } from "@supabase/supabase-js";
import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@acme/api/types";

import { makeFakeTables } from "./fake-tables";
import {
  MAX_ATTEMPTS,
  readPushTickets,
  runDispatch,
  STALE_SENDING_MS,
} from "./run-dispatch";

/**
 * Exercises the dispatch worker against fakes — no DB, no real Expo. Asserts
 * audience resolution (CMS user id → supabaseUserId), Expo fan-out, in-app
 * inserts, the status/sentCount write-back, retries (`attempts`), stale-row
 * recovery and push-ticket bookkeeping.
 */

type Row = Record<string, unknown>;

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

/** Long before any test run, so "registered before this send" holds. */
const OLD = "2020-01-01T00:00:00.000Z";

/**
 * Fake service-role client: `rpc()` serves the notifications RPCs. Tokens are
 * served in keyset pages so the pager is exercised; the broadcast returns the
 * number of audience members it was told about. `from()` is an in-memory
 * table store (push tokens + tickets).
 */
function makeAdmin(opts: { tokens?: string[]; audienceSize?: number } = {}) {
  const calls: RpcCall[] = [];
  const tokens = (opts.tokens ?? []).map((token, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    token,
  }));
  const store = makeFakeTables({
    mod_notifications_push_tokens: tokens.map((t) => ({
      ...t,
      created_at: OLD,
    })),
  });
  const api = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "mod_notifications_audience_tokens") {
        const after = args._after as string | undefined;
        const limit = args._limit as number;
        const page = tokens
          .filter((t) => after === undefined || t.id > after)
          .slice(0, limit);
        return Promise.resolve({ data: page, error: null });
      }
      if (fn === "mod_notifications_broadcast") {
        return Promise.resolve({ data: opts.audienceSize ?? 0, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `no ${fn}` } });
    },
    from: store.from,
  };
  return {
    admin: api as unknown as SupabaseClient<Database>,
    calls,
    store,
  };
}

interface FindArgs {
  collection: string;
  where?: Record<string, unknown>;
}
interface UpdateArgs {
  collection: string;
  id?: string | number;
  where?: Record<string, unknown>;
  data: Record<string, unknown>;
}

function makePayload(notifications: Row[], users: Row[]) {
  const updates: UpdateArgs[] = [];
  const payload = {
    find: vi.fn((args: FindArgs) => {
      if (args.collection === "notifications")
        return Promise.resolve({ docs: notifications });
      if (args.collection === "users") return Promise.resolve({ docs: users });
      return Promise.resolve({ docs: [] });
    }),
    update: vi.fn((args: UpdateArgs) => {
      updates.push(args);
      // Bulk (where) updates — the fallback claim — report the docs touched.
      return Promise.resolve("where" in args ? { docs: [{ id: 1 }] } : {});
    }),
    logger: { error: vi.fn(), warn: vi.fn() },
  };
  return { payload: payload as unknown as Payload, updates, raw: payload };
}

/** An Expo `/push/send` response with one ticket per message. */
function expoOk(tickets: Row[] = []) {
  return Promise.resolve(
    new Response(JSON.stringify({ data: tickets }), { status: 200 }),
  );
}

describe("runDispatch", () => {
  it("sends to targeted users (cms id → supabaseUserId) and marks sent", async () => {
    const { payload, updates, raw } = makePayload(
      [
        {
          id: 1,
          status: "scheduled",
          title: "Hi",
          body: "There",
          channel: ["push", "in_app"],
          audience: "users",
          targetUsers: [10],
        },
      ],
      [{ id: 10, supabaseUserId: "uuid-A" }],
    );
    const { admin, calls } = makeAdmin({
      tokens: ["ExpoTok1"],
      audienceSize: 1,
    });
    const fetchImpl = vi.fn(() => expoOk([{ status: "ok", id: "tkt-1" }]));

    const result = await runDispatch({
      payload,
      admin,
      fetchImpl,
    });

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, retried: 0 });
    // Claimed (sending) then completed (sent).
    expect(updates[0]?.data.status).toBe("sending");
    const final = updates[updates.length - 1];
    expect(final?.data.status).toBe("sent");
    expect(final?.data.sentCount).toBe(2); // 1 push token + 1 in-app row
    // Expo called with the targeted token.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // In-app rows go through the set-based broadcast for the resolved
    // Supabase user ids, keyed so a retry never duplicates them.
    const broadcast = calls.find((c) => c.fn === "mod_notifications_broadcast");
    expect(broadcast?.args).toMatchObject({
      _audience: "users",
      _user_ids: ["uuid-A"],
      _dedupe_key: "broadcast:1",
    });
    expect(raw.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "users" }),
    );
  });

  it("lists scheduled rows that are due and stale 'sending' rows", async () => {
    const { payload, raw } = makePayload([], []);
    const { admin } = makeAdmin();
    const now = new Date("2026-06-01T12:00:00.000Z");

    await runDispatch({ payload, admin, fetchImpl: vi.fn(), now });

    const where = raw.find.mock.calls[0]?.[0].where;
    expect(where).toEqual({
      or: [
        {
          and: [
            { status: { equals: "scheduled" } },
            { scheduledAt: { less_than_equal: now.toISOString() } },
          ],
        },
        {
          and: [
            { status: { equals: "sending" } },
            {
              updatedAt: {
                less_than: new Date(
                  now.getTime() - STALE_SENDING_MS,
                ).toISOString(),
              },
            },
          ],
        },
      ],
    });
  });

  it("puts a failed send back to scheduled and counts the attempt", async () => {
    const { payload, updates } = makePayload(
      [{ id: 2, status: "scheduled", title: "X", channel: ["push"] }],
      [],
    );
    const { admin } = makeAdmin({ tokens: ["T"] });
    const fetchImpl = vi.fn(() => Promise.reject(new Error("expo down")));

    const result = await runDispatch({ payload, admin, fetchImpl });

    expect(result).toEqual({ processed: 1, sent: 0, failed: 0, retried: 1 });
    expect(updates[updates.length - 1]?.data).toEqual({
      status: "scheduled",
      attempts: 1,
    });
  });

  it("marks a notification failed once its attempts are used up", async () => {
    const { payload, updates } = makePayload(
      [
        {
          id: 3,
          status: "scheduled",
          attempts: MAX_ATTEMPTS - 1,
          title: "X",
          channel: ["push"],
        },
      ],
      [],
    );
    const { admin } = makeAdmin({ tokens: ["T"] });
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response("", { status: 503 })),
    );

    const result = await runDispatch({ payload, admin, fetchImpl });

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1, retried: 0 });
    expect(updates[updates.length - 1]?.data).toEqual({
      status: "failed",
      attempts: MAX_ATTEMPTS,
    });
  });

  it("leaves the row alone when the claim itself errors", async () => {
    const { payload, updates } = makePayload(
      [{ id: 4, status: "scheduled", title: "X", channel: ["push"] }],
      [],
    );
    const { admin } = makeAdmin({ tokens: ["T"] });
    const fetchImpl = vi.fn();

    const result = await runDispatch({
      payload,
      admin,
      fetchImpl,
      claim: () => Promise.reject(new Error("db down")),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(result).toEqual({ processed: 1, sent: 0, failed: 0, retried: 0 });
  });

  it("recovers a stale 'sending' row, counting the crashed run as an attempt", async () => {
    const { payload, updates } = makePayload(
      [
        {
          id: 5,
          status: "sending",
          attempts: 1,
          title: "Again",
          channel: ["push"],
        },
      ],
      [],
    );
    const { admin } = makeAdmin({ tokens: ["T"] });
    const fetchImpl = vi.fn(() => expoOk([{ status: "ok", id: "tkt-5" }]));
    const claim = vi.fn(() => Promise.resolve(true));

    const result = await runDispatch({ payload, admin, fetchImpl, claim });

    expect(claim).toHaveBeenCalledWith(5);
    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, retried: 0 });
    expect(updates[0]?.data).toEqual({ attempts: 2 });
    expect(updates[updates.length - 1]?.data.status).toBe("sent");
  });

  it("gives up on a stale row whose attempts are used up, without sending", async () => {
    const { payload, updates } = makePayload(
      [
        {
          id: 6,
          status: "sending",
          attempts: MAX_ATTEMPTS - 1,
          title: "Crashy",
          channel: ["push"],
        },
      ],
      [],
    );
    const { admin } = makeAdmin({ tokens: ["T"] });
    const fetchImpl = vi.fn();

    const result = await runDispatch({
      payload,
      admin,
      fetchImpl,
      claim: () => Promise.resolve(true),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, sent: 0, failed: 1, retried: 0 });
    expect(updates[0]?.data).toEqual({
      status: "failed",
      attempts: MAX_ATTEMPTS,
    });
  });

  it("the fallback claim also takes over stale 'sending' rows", async () => {
    const { payload, updates } = makePayload(
      [{ id: 7, status: "scheduled", title: "Y", channel: ["in_app"] }],
      [],
    );
    const { admin } = makeAdmin({ audienceSize: 3 });
    const now = new Date("2026-06-01T12:00:00.000Z");

    await runDispatch({ payload, admin, fetchImpl: vi.fn(), now });

    expect(updates[0]?.where).toEqual({
      and: [
        { id: { equals: 7 } },
        {
          or: [
            { status: { equals: "scheduled" } },
            {
              and: [
                { status: { equals: "sending" } },
                {
                  updatedAt: {
                    less_than: new Date(
                      now.getTime() - STALE_SENDING_MS,
                    ).toISOString(),
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("does nothing when there are no due notifications", async () => {
    const { payload } = makePayload([], []);
    const { admin } = makeAdmin();
    const result = await runDispatch({
      payload,
      admin,
      fetchImpl: vi.fn(),
    });
    expect(result).toEqual({ processed: 0, sent: 0, failed: 0, retried: 0 });
  });

  it("skips a notification another run already claimed", async () => {
    const { payload, updates } = makePayload(
      [{ id: 8, status: "scheduled", title: "Y", channel: ["push"] }],
      [],
    );
    const { admin } = makeAdmin({ tokens: ["T"] });
    const fetchImpl = vi.fn();

    const result = await runDispatch({
      payload,
      admin,
      fetchImpl,
      claim: () => Promise.resolve(false),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(result).toEqual({ processed: 1, sent: 0, failed: 0, retried: 0 });
  });

  it("pages push tokens past PostgREST's 1000-row cap", async () => {
    const { payload, updates } = makePayload(
      [{ id: 9, status: "scheduled", title: "All", channel: ["push"] }],
      [],
    );
    const tokens = Array.from({ length: 2345 }, (_, i) => `Tok${i}`);
    const { admin, calls } = makeAdmin({ tokens });
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response("{}", { status: 200 })),
    );

    await runDispatch({ payload, admin, fetchImpl });

    // 2345 tokens → 3 keyset pages, 24 Expo requests of ≤100.
    const pages = calls.filter(
      (c) => c.fn === "mod_notifications_audience_tokens",
    );
    expect(pages).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(24);
    expect(updates[updates.length - 1]?.data.sentCount).toBe(2345);
  });

  it("stores ok tickets and drops tokens Expo reports as unregistered", async () => {
    const { payload, updates } = makePayload(
      [{ id: 10, status: "scheduled", title: "T", channel: ["push"] }],
      [],
    );
    const { admin, store } = makeAdmin({ tokens: ["Live", "Gone", "Other"] });
    const fetchImpl = vi.fn(() =>
      expoOk([
        { status: "ok", id: "tkt-live" },
        {
          status: "error",
          message: "not registered",
          details: { error: "DeviceNotRegistered" },
        },
        { status: "error", message: "too big", details: { error: "Other" } },
      ]),
    );

    await runDispatch({ payload, admin, fetchImpl });

    expect(store.tables.mod_notifications_push_tickets).toEqual([
      { id: "tkt-live", token: "Live" },
    ]);
    expect(
      store.tables.mod_notifications_push_tokens?.map((t) => t.token),
    ).toEqual(["Live", "Other"]);
    expect(updates[updates.length - 1]?.data.status).toBe("sent");
  });

  it("still marks sent when ticket bookkeeping fails (no re-send)", async () => {
    const { payload, updates, raw } = makePayload(
      [{ id: 11, status: "scheduled", title: "T", channel: ["push"] }],
      [],
    );
    const { admin, store } = makeAdmin({ tokens: ["Live"] });
    store.failOn.mod_notifications_push_tickets = "table missing";
    const fetchImpl = vi.fn(() => expoOk([{ status: "ok", id: "tkt-1" }]));

    const result = await runDispatch({ payload, admin, fetchImpl });

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, retried: 0 });
    expect(updates[updates.length - 1]?.data.status).toBe("sent");
    expect(raw.logger.warn).toHaveBeenCalled();
  });
});

describe("readPushTickets", () => {
  it("pairs tickets with tokens by position", () => {
    expect(
      readPushTickets(
        {
          data: [
            { status: "error", details: { error: "DeviceNotRegistered" } },
            { status: "ok", id: "b" },
          ],
        },
        ["A", "B"],
      ),
    ).toEqual({ tickets: [{ id: "b", token: "B" }], deadTokens: ["A"] });
  });

  it("tolerates a missing or malformed body", () => {
    expect(readPushTickets(null, ["A"])).toEqual({
      tickets: [],
      deadTokens: [],
    });
    expect(readPushTickets({ data: "nope" }, ["A"])).toEqual({
      tickets: [],
      deadTokens: [],
    });
  });

  it("accepts Expo's single-object form for one message", () => {
    expect(readPushTickets({ data: { status: "ok", id: "x" } }, ["A"])).toEqual(
      { tickets: [{ id: "x", token: "A" }], deadTokens: [] },
    );
  });
});
