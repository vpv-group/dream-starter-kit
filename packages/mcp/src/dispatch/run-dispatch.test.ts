import type { SupabaseClient } from "@supabase/supabase-js";
import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@acme/api/types";

import { runDispatch } from "./run-dispatch";

/**
 * Exercises the dispatch worker against fakes — no DB, no real Expo. Asserts
 * audience resolution (CMS user id → supabaseUserId), Expo fan-out, in-app
 * inserts, and the status/sentCount write-back.
 */

type Row = Record<string, unknown>;

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

/**
 * Fake service-role client: `rpc()` serves the notifications RPCs. Tokens are
 * served in keyset pages so the pager is exercised; the broadcast returns the
 * number of audience members it was told about.
 */
function makeAdmin(opts: { tokens?: string[]; audienceSize?: number } = {}) {
  const calls: RpcCall[] = [];
  const tokens = (opts.tokens ?? []).map((token, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    token,
  }));
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
  };
  return { admin: api as unknown as SupabaseClient<Database>, calls };
}

interface FindArgs {
  collection: string;
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
    logger: { error: vi.fn() },
  };
  return { payload: payload as unknown as Payload, updates, raw: payload };
}

describe("runDispatch", () => {
  it("sends to targeted users (cms id → supabaseUserId) and marks sent", async () => {
    const { payload, updates, raw } = makePayload(
      [
        {
          id: 1,
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
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response("{}", { status: 200 })),
    );

    const result = await runDispatch({
      payload,
      admin,
      fetchImpl,
    });

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
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

  it("marks a notification failed when delivery throws", async () => {
    const { payload, updates } = makePayload(
      [{ id: 2, title: "X", channel: ["push"], audience: "all" }],
      [],
    );
    const { admin } = makeAdmin({ tokens: ["T"] });
    const fetchImpl = vi.fn(() => Promise.reject(new Error("expo down")));

    const result = await runDispatch({
      payload,
      admin,
      fetchImpl,
    });

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(updates[updates.length - 1]?.data.status).toBe("failed");
  });

  it("does nothing when there are no due notifications", async () => {
    const { payload } = makePayload([], []);
    const { admin } = makeAdmin();
    const result = await runDispatch({
      payload,
      admin,
      fetchImpl: vi.fn(),
    });
    expect(result).toEqual({ processed: 0, sent: 0, failed: 0 });
  });

  it("skips a notification another run already claimed", async () => {
    const { payload, updates } = makePayload(
      [{ id: 3, title: "Y", channel: ["push"], audience: "all" }],
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
    expect(result).toEqual({ processed: 1, sent: 0, failed: 0 });
  });

  it("pages push tokens past PostgREST's 1000-row cap", async () => {
    const { payload, updates } = makePayload(
      [{ id: 4, title: "All", channel: ["push"], audience: "all" }],
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
});
