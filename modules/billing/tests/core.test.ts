/**
 * Billing core: the provider-neutral ledger and provider resolution that
 * payment adapters build on.
 */
import { describe, expect, it } from "vitest";

import { setModAdaptersForTest } from "@acme/mod-kit/server";

import type { BillingProvider } from "../src/server/core/types";
import {
  applySubscription,
  findCustomerUser,
  findUserCustomer,
  linkCustomer,
  subscriptionRow,
} from "../src/server/core/ledger";
import { resolveWebProvider } from "../src/server/core/providers";
import { moveBillingRows } from "../src/server/core/users";
import { memoryDb } from "./memory-db";

describe("ledger", () => {
  it("maps a normalized purchase to the apply row with provider defaults", () => {
    expect(
      subscriptionRow({
        provider: "revenuecat",
        id: "rc:txn_1",
        userId: "u1",
        priceId: null,
        status: "active",
        currentPeriodEnd: null,
        store: "app_store",
      }),
    ).toEqual({
      id: "rc:txn_1",
      user_id: "u1",
      price_id: null,
      status: "active",
      quantity: null,
      cancel_at_period_end: false,
      current_period_end: null,
      provider: "revenuecat",
      kind: "subscription",
      plan_id: null,
      entitlement: "premium",
      store: "app_store",
      environment: null,
      org_id: null,
      granted_by: null,
      note: null,
    });
  });

  it("applies with the provider's event time (null: always)", async () => {
    const db = memoryDb();
    const at = new Date("2030-01-01T00:00:00.000Z");
    await applySubscription(
      db.admin,
      {
        provider: "stripe",
        id: "sub_1",
        userId: "u1",
        priceId: "price_1",
        status: "active",
        currentPeriodEnd: null,
      },
      at,
    );
    expect(db.rpcCalls[0]).toMatchObject({
      fn: "mod_billing_apply_subscription",
      args: { _event_at: at.toISOString() },
    });
  });

  it("links one customer per user + provider, moving a re-linked id", async () => {
    const db = memoryDb();
    await linkCustomer(db.admin, {
      userId: "anon",
      provider: "stripe",
      customerId: "cus_1",
    });
    await linkCustomer(db.admin, {
      userId: "real",
      provider: "stripe",
      customerId: "cus_1",
    });
    expect(await findCustomerUser(db.admin, "stripe", "cus_1")).toBe("real");
    expect(await findUserCustomer(db.admin, "anon", "stripe")).toBeNull();
    // Stripe links are mirrored into billing 1.x's table for one release.
    expect(db.tables.mod_billing_customers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: "real",
          stripe_customer_id: "cus_1",
        }),
      ]),
    );
  });

  it("reads billing 1.x's Stripe mapping when no link exists yet", async () => {
    const db = memoryDb({
      mod_billing_customers: [{ user_id: "u1", stripe_customer_id: "cus_old" }],
    });
    expect(await findCustomerUser(db.admin, "stripe", "cus_old")).toBe("u1");
    expect(await findUserCustomer(db.admin, "u1", "stripe")).toBe("cus_old");
    expect(await findUserCustomer(db.admin, "u1", "revenuecat")).toBeNull();
  });

  it("moves purchases + links to the real account, keeping theirs on conflict", async () => {
    const db = memoryDb({
      mod_billing_subscriptions: [{ id: "sub_1", user_id: "anon" }],
      mod_billing_customer_links: [
        { user_id: "anon", provider: "stripe", provider_customer_id: "cus_a" },
        {
          user_id: "anon",
          provider: "revenuecat",
          provider_customer_id: "rc_a",
        },
        { user_id: "real", provider: "stripe", provider_customer_id: "cus_r" },
      ],
    });
    await moveBillingRows(db.admin, "anon", "real");
    expect(db.tables.mod_billing_subscriptions?.[0]?.user_id).toBe("real");
    expect(
      db.tables.mod_billing_customer_links?.map((l) => [
        l.user_id,
        l.provider,
        l.provider_customer_id,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["real", "revenuecat", "rc_a"],
        ["real", "stripe", "cus_r"],
      ]),
    );
    expect(
      db.tables.mod_billing_customer_links?.some((l) => l.user_id === "anon"),
    ).toBe(false);
  });
});

describe("resolveWebProvider", () => {
  const provider = (
    id: string,
    over: Partial<BillingProvider> = {},
  ): BillingProvider => ({
    id,
    label: id,
    platforms: ["web"],
    isConfigured: () => Promise.resolve(true),
    ...over,
  });

  it("picks the first configured web provider, or the requested one", async () => {
    setModAdaptersForTest("billing", [
      {
        slug: "billing-adapter-iap",
        adapter: provider("iap", { platforms: ["ios", "android"] }),
      },
      {
        slug: "billing-adapter-off",
        adapter: provider("off", {
          isConfigured: () => Promise.resolve(false),
        }),
      },
      { slug: "billing-adapter-stripe", adapter: provider("stripe") },
    ]);
    expect((await resolveWebProvider())?.id).toBe("stripe");
    expect((await resolveWebProvider("iap"))?.id).toBe("iap");
    expect(await resolveWebProvider("off")).toBeNull();
    expect(await resolveWebProvider("missing")).toBeNull();
  });

  it("is null when no provider is installed", async () => {
    setModAdaptersForTest("billing", []);
    expect(await resolveWebProvider()).toBeNull();
  });
});
