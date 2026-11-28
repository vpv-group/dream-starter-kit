/**
 * Billing's MCP tools (src/server/mcp.ts) against a FAKE Payload: plan and
 * coupon read/create/update/delete/resync, the cross-field rules, that every
 * call acts as the staff caller (overrideAccess: false + user), and that the
 * input schemas stay JSON-Schema-representable for MCP clients.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ModMcpContext, ModMcpTool } from "@acme/mod-kit/server";

import {
  describeDiscount,
  describePrice,
  formatAmount,
  mcp,
} from "../src/server/mcp";

type Doc = Record<string, unknown> & { id: number };
type Where = Record<string, unknown>;

/** Just enough of Payload's `where` for the tools' queries. */
function matches(doc: Doc, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === "and") return (cond as Where[]).every((w) => matches(doc, w));
    if (key === "or") return (cond as Where[]).some((w) => matches(doc, w));
    const value = doc[key];
    const ops = cond as Record<string, unknown>;
    return Object.entries(ops).every(([op, want]) => {
      const values = Array.isArray(value) ? value : [value];
      switch (op) {
        case "equals":
          return values.some((v) => String(v) === String(want));
        case "not_equals":
          return !values.some((v) => String(v) === String(want));
        case "in":
          return (want as unknown[]).some((w) =>
            values.some((v) => String(v) === String(w)),
          );
        case "like":
          return values.some((v) =>
            String(v ?? "")
              .toLowerCase()
              .includes(String(want).toLowerCase()),
          );
        default:
          throw new Error(`fake payload: unsupported op ${op}`);
      }
    });
  });
}

const PLAN_DEFAULTS = {
  active: true,
  pricingType: "recurring",
  interval: "month",
  intervalCount: 1,
  currency: "usd",
  entitlement: "premium",
  skipSync: false,
  syncStatus: "unsynced",
};
const COUPON_DEFAULTS = {
  active: true,
  discountType: "percent_off",
  duration: "once",
  timesRedeemed: 0,
  skipSync: false,
  syncStatus: "unsynced",
};

function fakePayload(opts: { providerConnected?: boolean } = {}) {
  const tables: Record<string, Doc[]> = {
    "mod-billing-plans": [],
    "mod-billing-coupons": [],
    "mod-billing-subscriptions": [],
  };
  const nextId: Record<string, number> = {};
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const table = (c: unknown) => {
    const t = tables[c as string];
    if (!t) throw new Error(`unknown collection ${String(c)}`);
    return t;
  };
  /** What billing's afterChange catalog hook + a provider would do. */
  const sync = (collection: string, doc: Doc) => {
    if (collection === "mod-billing-subscriptions" || doc.skipSync) return;
    if (!opts.providerConnected) return;
    doc.syncStatus = "synced";
    doc.lastSyncedAt = "2026-11-28T00:00:00.000Z";
    if (collection === "mod-billing-plans")
      doc.stripePriceId = `price_${doc.id}_${String(doc.unitAmount)}`;
  };
  const track = (op: string, args: Record<string, unknown>) => {
    calls.push({ op, args });
  };
  const payload = {
    find: vi.fn((args: Record<string, unknown>) => {
      track("find", args);
      const all = table(args.collection).filter((d) =>
        matches(d, args.where as Where),
      );
      const limit = (args.limit as number | undefined) ?? 10;
      const docs = all.slice(0, limit).map((d) => ({ ...d }));
      return Promise.resolve({
        docs,
        totalDocs: all.length,
        page: 1,
        totalPages: Math.max(1, Math.ceil(all.length / limit)),
      });
    }),
    findByID: vi.fn((args: Record<string, unknown>) => {
      track("findByID", args);
      const doc = table(args.collection).find(
        (d) => String(d.id) === String(args.id),
      );
      return doc
        ? Promise.resolve({ ...doc })
        : Promise.reject(new Error("NotFound"));
    }),
    count: vi.fn((args: Record<string, unknown>) => {
      track("count", args);
      return Promise.resolve({
        totalDocs: table(args.collection).filter((d) =>
          matches(d, args.where as Where),
        ).length,
      });
    }),
    create: vi.fn((args: Record<string, unknown>) => {
      track("create", args);
      const defaults =
        args.collection === "mod-billing-plans"
          ? PLAN_DEFAULTS
          : args.collection === "mod-billing-coupons"
            ? COUPON_DEFAULTS
            : {};
      const data = args.data as Record<string, unknown>;
      const doc: Doc = {
        ...defaults,
        ...data,
        id: (nextId[args.collection as string] =
          (nextId[args.collection as string] ?? 0) + 1),
        ...(args.collection === "mod-billing-plans" && !data.slug
          ? {
              slug: String(data.name)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-"),
            }
          : {}),
      };
      table(args.collection).push(doc);
      sync(args.collection as string, doc);
      return Promise.resolve({ ...doc });
    }),
    update: vi.fn((args: Record<string, unknown>) => {
      track("update", args);
      const doc = table(args.collection).find(
        (d) => String(d.id) === String(args.id),
      );
      if (!doc) return Promise.reject(new Error("NotFound"));
      Object.assign(doc, args.data);
      sync(args.collection as string, doc);
      return Promise.resolve({ ...doc });
    }),
    delete: vi.fn((args: Record<string, unknown>) => {
      track("delete", args);
      const t = table(args.collection);
      const i = t.findIndex((d) => String(d.id) === String(args.id));
      const [doc] = t.splice(i, 1);
      return Promise.resolve(doc);
    }),
  };
  return { payload, tables, calls };
}

const rpc = vi.fn(() => Promise.resolve({ data: 1, error: null }));
let fake: ReturnType<typeof fakePayload>;
let ctx: ModMcpContext;

function setup(opts: { providerConnected?: boolean } = {}) {
  fake = fakePayload(opts);
  rpc.mockClear();
  ctx = {
    userId: "supabase-staff-1",
    cmsUser: { id: 7, roles: ["admin"], collection: "users" },
    payload: fake.payload,
    admin: { rpc },
    origin: "https://app.test",
    host: {},
  } as unknown as ModMcpContext;
}

const tools = new Map<string, ModMcpTool>(
  (mcp.tools ?? []).map((t) => [t.name, t]),
);

/** Tool results are plain JSON; a permissive view keeps the assertions terse. */
interface Json {
  [key: string]: Json;
}

/** Like the MCP SDK: validate against the tool's shape, then run it. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  const parsed = z.object(tool.inputSchema).parse(args);
  return (await tool.run(parsed, ctx)) as Json;
}

beforeEach(() => {
  setup();
});

describe("billing MCP extension", () => {
  it("prefixes every tool with billing_ and keeps schemas JSON-Schema-safe", () => {
    expect(tools.size).toBeGreaterThanOrEqual(11);
    for (const tool of tools.values()) {
      expect(tool.name.startsWith("billing_")).toBe(true);
      // MCP clients receive inputSchema as JSON Schema; transforms would throw.
      expect(() => z.toJSONSchema(z.object(tool.inputSchema))).not.toThrow();
    }
    expect(mcp.instructions).toMatch(/billing_/);
  });

  it("formats prices and discounts for people", () => {
    expect(formatAmount(999, "usd")).toBe("$9.99");
    expect(
      describePrice({
        unitAmount: 1900,
        currency: "usd",
        pricingType: "recurring",
        interval: "month",
        intervalCount: 1,
      }),
    ).toBe("$19.00 / month");
    expect(
      describePrice({
        unitAmount: 4500,
        currency: "usd",
        pricingType: "recurring",
        interval: "month",
        intervalCount: 3,
      }),
    ).toBe("$45.00 every 3 months");
    expect(
      describePrice({
        unitAmount: 19900,
        currency: "usd",
        pricingType: "one_time",
      }),
    ).toBe("$199.00 once");
    expect(
      describeDiscount({
        discountType: "percent_off",
        value: 20,
        duration: "repeating",
        durationCount: 3,
        durationUnit: "month",
      }),
    ).toBe("20% off for 3 months");
    expect(
      describeDiscount({
        discountType: "amount_off",
        value: 500,
        currency: "usd",
        duration: "forever",
      }),
    ).toBe("$5.00 off forever");
  });
});

describe("plans", () => {
  it("creates a plan as the staff caller and reports the provider sync", async () => {
    setup({ providerConnected: true });
    const res = await call("billing_create_plan", {
      name: "Pro Monthly",
      unitAmount: 1900,
      currency: "USD",
      features: [{ text: "Everything" }],
    });
    expect(res.created).toBe(true);
    expect(res.plan).toMatchObject({
      name: "Pro Monthly",
      slug: "pro-monthly",
      price: "$19.00 / month",
      currency: "usd",
      interval: "month",
      features: [{ text: "Everything", included: true }],
      sync: { status: "synced" },
      provider: { stripePriceId: "price_1_1900" },
    });
    expect(res.note).toBeUndefined();

    // Every Payload call acts as the caller — never with access overridden.
    for (const c of fake.calls) {
      expect(c.args.overrideAccess).toBe(false);
      expect(c.args.user).toMatchObject({ id: 7, collection: "users" });
    }
    expect(rpc).toHaveBeenCalledWith(
      "audit_log_event",
      expect.objectContaining({
        _action: "billing.plan.create",
        _actor_id: "supabase-staff-1",
        _entity_type: "billing_plan",
      }),
    );
  });

  it("explains an unsynced plan when no provider is connected", async () => {
    const res = await call("billing_create_plan", {
      name: "Pro",
      unitAmount: 900,
    });
    expect(res.plan?.sync?.status).toBe("unsynced");
    expect(res.note).toMatch(/payment provider/);
  });

  it("rejects recurring-only fields on a one-time plan", async () => {
    await expect(
      call("billing_create_plan", {
        name: "Lifetime",
        unitAmount: 19900,
        pricingType: "one_time",
        trialDays: 7,
      }),
    ).rejects.toThrow(/trialDays only apply to recurring plans/);
    expect(fake.tables["mod-billing-plans"]).toHaveLength(0);
  });

  it("requires an intro price below the plan price", async () => {
    await expect(
      call("billing_create_plan", {
        name: "Pro",
        unitAmount: 1900,
        introOffer: { enabled: true, introAmount: 1900 },
      }),
    ).rejects.toThrow(/introAmount must be lower/);
    const ok = await call("billing_create_plan", {
      name: "Pro",
      unitAmount: 1900,
      introOffer: { enabled: true, introAmount: 100 },
    });
    expect(ok.plan?.introOffer).toMatchObject({
      introAmount: 100,
      introInterval: "month",
      introPeriods: 1,
      text: "$1.00 for the first 1 month(s)",
    });
  });

  it("lists, filters and reads plans by id or slug with subscriber counts", async () => {
    await call("billing_create_plan", {
      name: "Monthly",
      unitAmount: 1900,
      displayOrder: 1,
    });
    await call("billing_create_plan", {
      name: "Old",
      unitAmount: 900,
      active: false,
    });
    fake.tables["mod-billing-subscriptions"]?.push(
      { id: 90, plan: 1, status: "active" },
      { id: 91, plan: 1, status: "canceled" },
    );
    await call("billing_create_coupon", {
      name: "Launch",
      value: 20,
      appliesTo: [1],
    });

    const all = await call("billing_list_plans");
    expect(all.total).toBe(2);
    const active = await call("billing_list_plans", { active: true });
    expect(active.plans).toMatchObject([{ name: "Monthly" }]);
    expect(active.total).toBe(1);

    const byId = await call("billing_get_plan", { id: 1 });
    expect(byId.subscribers).toEqual({ live: 1, total: 2 });
    expect(byId.couponsLimitedToPlan).toEqual([
      expect.objectContaining({
        name: "Launch",
        discount: "20% off once (first invoice)",
      }),
    ]);
    const bySlug = await call("billing_get_plan", { slug: "old" });
    expect(bySlug.plan?.name).toBe("Old");
    await expect(call("billing_get_plan", { id: 99 })).rejects.toThrow(
      /No plan with id 99/,
    );
  });

  it("updates only the given fields and flags a price change", async () => {
    setup({ providerConnected: true });
    await call("billing_create_plan", {
      name: "Pro",
      unitAmount: 1900,
      badge: "Hot",
    });
    const res = await call("billing_update_plan", {
      id: 1,
      unitAmount: 2400,
      badge: null,
    });
    expect(res.plan).toMatchObject({ price: "$24.00 / month", badge: null });
    expect(res.plan?.provider?.stripePriceId).toBe("price_1_2400");
    expect(res.note).toMatch(/\$19\.00 \/ month → \$24\.00 \/ month/);
    const update = fake.calls.find((c) => c.op === "update");
    expect(update?.args.data).toEqual({ unitAmount: 2400, badge: null });

    const rename = await call("billing_update_plan", { id: 1, name: "Pro+" });
    expect(rename.note).toBeUndefined();
    await expect(call("billing_update_plan", { id: 1 })).rejects.toThrow(
      /Nothing to change/,
    );
  });

  it("merges a partial intro-offer change into the existing offer", async () => {
    await call("billing_create_plan", {
      name: "Pro",
      unitAmount: 1900,
      introOffer: { enabled: true, introAmount: 100, introPeriods: 2 },
    });
    const res = await call("billing_update_plan", {
      id: 1,
      introOffer: { enabled: true, introAmount: 200 },
    });
    expect(res.plan?.introOffer).toMatchObject({
      introAmount: 200,
      introPeriods: 2,
    });
  });

  it("refuses to delete a plan with purchases, else deactivates then deletes", async () => {
    await call("billing_create_plan", { name: "Used", unitAmount: 1900 });
    await call("billing_create_plan", { name: "Unused", unitAmount: 900 });
    fake.tables["mod-billing-subscriptions"]?.push({
      id: 90,
      plan: 1,
      status: "canceled",
    });

    await expect(call("billing_delete_plan", { id: 1 })).rejects.toThrow(
      /can't be deleted.*active: false/s,
    );
    expect(fake.tables["mod-billing-plans"]).toHaveLength(2);

    const res = await call("billing_delete_plan", { id: 2 });
    expect(res).toEqual({ deleted: true, id: 2, name: "Unused" });
    const ops = fake.calls.filter(
      (c) => c.op === "update" || c.op === "delete",
    );
    expect(ops.map((c) => [c.op, c.args.data])).toEqual([
      ["update", { active: false }],
      ["delete", undefined],
    ]);
  });
});

describe("coupons", () => {
  it("creates percent and amount coupons with defaults", async () => {
    const pct = await call("billing_create_coupon", {
      name: "Launch",
      value: 20,
      code: " LAUNCH20 ",
    });
    expect(pct.coupon).toMatchObject({
      code: "LAUNCH20",
      discount: "20% off once (first invoice)",
      currency: null,
      appliesTo: [],
    });
    const amt = await call("billing_create_coupon", {
      name: "Five off",
      discountType: "amount_off",
      value: 500,
      currency: "EUR",
      duration: "repeating",
      durationCount: 2,
      durationUnit: "year",
    });
    expect(amt.coupon).toMatchObject({
      currency: "eur",
      durationCount: 2,
      durationUnit: "year",
      discount: "€5.00 off for 2 years",
    });
  });

  it("validates percent range, expiry and plan ids", async () => {
    await expect(
      call("billing_create_coupon", { name: "Too much", value: 150 }),
    ).rejects.toThrow(/1–100/);
    await expect(
      call("billing_create_coupon", {
        name: "Old",
        value: 10,
        redeemBy: "2020-01-01T00:00:00Z",
      }),
    ).rejects.toThrow(/future/);
    await expect(
      call("billing_create_coupon", {
        name: "Ghost",
        value: 10,
        appliesTo: [42],
      }),
    ).rejects.toThrow(/no plan with id 42/);
    await expect(
      call("billing_create_coupon", {
        name: "Spaces",
        value: 10,
        code: "TWO WORDS",
      }),
    ).rejects.toThrow();
  });

  it("keeps one active welcome offer and unique promotion codes", async () => {
    await call("billing_create_coupon", {
      name: "Welcome",
      value: 30,
      isWelcomeOffer: true,
      code: "HELLO",
    });
    await expect(
      call("billing_create_coupon", {
        name: "Welcome 2",
        value: 40,
        isWelcomeOffer: true,
      }),
    ).rejects.toThrow(/Only one active welcome offer/);
    await expect(
      call("billing_create_coupon", { name: "Dup", value: 10, code: "HELLO" }),
    ).rejects.toThrow(/already used by coupon "Welcome"/);
    // An inactive welcome offer doesn't block, and the coupon itself is no conflict.
    await call("billing_create_coupon", {
      name: "Draft welcome",
      value: 40,
      isWelcomeOffer: true,
      active: false,
    });
    const self = await call("billing_update_coupon", {
      id: 1,
      code: "HELLO",
      value: 35,
    });
    expect(self.updated).toBe(true);
    await expect(
      call("billing_update_coupon", { id: 2, active: true }),
    ).rejects.toThrow(/Only one active welcome offer/);
  });

  it("lists, reads by code, flags term changes and deletes", async () => {
    await call("billing_create_plan", { name: "Pro", unitAmount: 1900 });
    await call("billing_create_coupon", {
      name: "Launch",
      value: 20,
      code: "LAUNCH",
      appliesTo: [1],
    });
    await call("billing_create_coupon", {
      name: "Old",
      value: 10,
      active: false,
    });

    expect((await call("billing_list_coupons", { active: true })).total).toBe(
      1,
    );
    expect(
      (await call("billing_list_coupons", { planId: 1 })).coupons?.[0]?.name,
    ).toBe("Launch");
    expect((await call("billing_list_coupons", { query: "laun" })).total).toBe(
      1,
    );
    expect(
      (await call("billing_get_coupon", { code: "LAUNCH" })).coupon?.appliesTo,
    ).toEqual([1]);

    const changed = await call("billing_update_coupon", { id: 1, value: 25 });
    expect(changed.note).toMatch(/20% off once.*→ 25% off once/);
    const renamed = await call("billing_update_coupon", {
      id: 1,
      name: "Launch!",
    });
    expect(renamed.note).toBeUndefined();

    expect(await call("billing_delete_coupon", { id: 2 })).toEqual({
      deleted: true,
      id: 2,
      name: "Old",
    });
    await expect(call("billing_get_coupon", { id: 2 })).rejects.toThrow(
      /No coupon with id 2/,
    );
  });
});

describe("resync", () => {
  it("re-saves every unsynced, non-skipped doc and reports the outcome", async () => {
    await call("billing_create_plan", { name: "A", unitAmount: 100 });
    await call("billing_create_plan", {
      name: "B",
      unitAmount: 200,
      skipSync: true,
    });
    // Connect a provider after the plans were made (seeded sites start here).
    const before = fake.tables;
    setup({ providerConnected: true });
    fake.tables["mod-billing-plans"]?.push(
      ...(before["mod-billing-plans"] ?? []),
    );

    const res = await call("billing_resync", { target: "plans" });
    expect(res.resynced).toBe(1);
    expect(res.results).toMatchObject([
      { name: "A", sync: { status: "synced" } },
    ]);
    expect(res.note).toBeUndefined();

    const one = await call("billing_resync", { target: "plans", id: 2 });
    expect(one.results).toMatchObject([{ sync: { status: "skipped" } }]);
  });
});
