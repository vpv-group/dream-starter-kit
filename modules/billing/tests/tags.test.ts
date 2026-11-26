/**
 * Billing tags: which tags a member should carry for their purchases (pure),
 * and the reconcile that only ever touches tags billing manages.
 */
import { describe, expect, it } from "vitest";

import type { TagInput } from "../src/server/core/tags";
import {
  cycleLabel,
  desiredBillingTags,
  statusValue,
} from "../src/server/core/tags";
import { memoryDb } from "./memory-db";

const row = (over: Partial<TagInput> = {}): TagInput => ({
  status: "active",
  cancelAtPeriodEnd: false,
  kind: "subscription",
  store: "web",
  planName: "Pro",
  interval: "month",
  intervalCount: 1,
  ...over,
});

const names = (
  rows: TagInput[],
  settings?: Parameters<typeof desiredBillingTags>[1],
) =>
  desiredBillingTags(rows, settings)
    .map((t) => t.name)
    .sort();

describe("statusValue", () => {
  it("walks a member through free → trialing → active → canceling → churned", () => {
    expect(statusValue([])).toBe("free");
    expect(statusValue([row({ status: "trialing" })])).toBe("trialing");
    expect(statusValue([row()])).toBe("active");
    expect(statusValue([row({ cancelAtPeriodEnd: true })])).toBe("canceling");
    expect(statusValue([row({ status: "canceled" })])).toBe("churned");
  });

  it("reports payment trouble, and ignores abandoned checkouts", () => {
    expect(statusValue([row({ status: "past_due" })])).toBe("past_due");
    expect(statusValue([row({ status: "unpaid" })])).toBe("past_due");
    // An unpaid embedded checkout never made them a customer.
    expect(statusValue([row({ status: "incomplete_expired" })])).toBe("free");
  });

  it("prefers a renewing paid plan over a trial or a canceling one", () => {
    expect(
      statusValue([row({ status: "trialing" }), row({ status: "active" })]),
    ).toBe("active");
    expect(
      statusValue([
        row({ cancelAtPeriodEnd: true }),
        row({ kind: "one_time" }),
      ]),
    ).toBe("active");
  });
});

describe("cycleLabel", () => {
  it("names common cadences", () => {
    expect(cycleLabel(row())).toBe("Monthly");
    expect(cycleLabel(row({ interval: "year" }))).toBe("Annual");
    expect(cycleLabel(row({ interval: "month", intervalCount: 3 }))).toBe(
      "Quarterly",
    );
    expect(cycleLabel(row({ interval: "week", intervalCount: 2 }))).toBe(
      "Every 2 weeks",
    );
    expect(cycleLabel(row({ kind: "one_time", interval: null }))).toBe(
      "Lifetime",
    );
    expect(cycleLabel(row({ interval: null }))).toBeNull();
  });
});

describe("desiredBillingTags", () => {
  it("tags plan, status, cycle and store with the default names", () => {
    expect(names([row()])).toEqual([
      "Active",
      "Billing cycle: Monthly",
      "Pro",
      "Store: Web",
    ]);
  });

  it("gives a member with nothing only the Free status (billing 1.x's tag)", () => {
    expect(names([])).toEqual(["Free"]);
  });

  it("covers purchases from several stores at once", () => {
    expect(
      names([
        row(),
        row({
          store: "app_store",
          planName: "Pro (iOS)",
          interval: "year",
        }),
      ]),
    ).toEqual([
      "Active",
      "Billing cycle: Annual",
      "Billing cycle: Monthly",
      "Pro",
      "Pro (iOS)",
      "Store: App Store",
      "Store: Web",
    ]);
  });

  it("keeps the status but drops plan/cycle/store tags once churned", () => {
    expect(names([row({ status: "canceled" })])).toEqual(["Churned"]);
  });

  it("follows the Tags settings: templates and switched-off groups", () => {
    expect(
      names([row({ kind: "one_time", interval: null })], {
        plan: { template: "Plan: {plan}" },
        status: { enabled: false },
        store: { enabled: false },
      }),
    ).toEqual(["Billing cycle: Lifetime", "Plan: Pro"]);
    expect(names([row()], { enabled: false })).toEqual([]);
  });
});

describe("syncBillingTags (reconcile)", () => {
  const USER = "user-1";
  const catalog = {
    mod_billing_products: [{ id: "prod_pro", name: "Pro" }],
    mod_billing_prices: [
      {
        id: "price_m",
        product_id: "prod_pro",
        interval: "month",
        interval_count: 1,
      },
      {
        id: "price_y",
        product_id: "prod_pro",
        interval: "year",
        interval_count: 1,
      },
    ],
  };
  const sub = (over: Record<string, unknown> = {}) => ({
    id: "sub_1",
    user_id: USER,
    status: "active",
    cancel_at_period_end: false,
    kind: "subscription",
    store: "web",
    price_id: "price_m",
    ...over,
  });

  it("adds billing tags, then swaps them as the subscription changes", async () => {
    const { syncBillingTags } = await import("../src/server/core/tags");
    const db = memoryDb({ ...catalog, mod_billing_subscriptions: [sub()] });
    await syncBillingTags(db.admin, USER);
    expect(db.tagsOf(USER)).toEqual([
      "Active",
      "Billing cycle: Monthly",
      "Pro",
      "Store: Web",
    ]);

    // Switched to annual, set to cancel.
    Object.assign(db.tables.mod_billing_subscriptions?.[0] ?? {}, {
      price_id: "price_y",
      cancel_at_period_end: true,
    });
    const res = await syncBillingTags(db.admin, USER);
    expect(db.tagsOf(USER)).toEqual([
      "Billing cycle: Annual",
      "Canceling",
      "Pro",
      "Store: Web",
    ]);
    expect(res.removed).toBe(2);

    // Ended.
    Object.assign(db.tables.mod_billing_subscriptions?.[0] ?? {}, {
      status: "canceled",
    });
    await syncBillingTags(db.admin, USER);
    expect(db.tagsOf(USER)).toEqual(["Churned"]);
  });

  it("never touches staff tags — not even one named like a billing tag", async () => {
    const { syncBillingTags } = await import("../src/server/core/tags");
    const db = memoryDb({
      ...catalog,
      mod_billing_subscriptions: [sub()],
      tags: [
        { id: "t_vip", name: "VIP", is_system: false },
        // A staff tag that happens to be called "Active".
        { id: "t_active", name: "Active", is_system: false },
      ],
      user_tags: [
        { id: "l1", user_id: USER, tag_id: "t_vip" },
        { id: "l2", user_id: USER, tag_id: "t_active" },
      ],
    });
    await syncBillingTags(db.admin, USER);
    // VIP + the staff "Active" stay; billing skipped its own "Active".
    expect(db.tagsOf(USER)).toEqual([
      "Active",
      "Billing cycle: Monthly",
      "Pro",
      "Store: Web",
      "VIP",
    ]);
    expect(
      db.tables.mod_billing_managed_tags?.some((m) => m.tag_id === "t_active"),
    ).toBe(false);

    // Churn: billing removes only its own tags.
    Object.assign(db.tables.mod_billing_subscriptions?.[0] ?? {}, {
      status: "canceled",
    });
    await syncBillingTags(db.admin, USER);
    expect(db.tagsOf(USER)).toEqual(["Active", "Churned", "VIP"]);
  });

  it("adopts billing 1.x's system tags (Free, plan names) when it uses them", async () => {
    const { syncBillingTags } = await import("../src/server/core/tags");
    const db = memoryDb({
      tags: [{ id: "t_free", name: "Free", is_system: true }],
      user_tags: [{ id: "l1", user_id: USER, tag_id: "t_free" }],
    });
    await syncBillingTags(db.admin, USER);
    expect(db.tagsOf(USER)).toEqual(["Free"]);
    expect(db.tables.mod_billing_managed_tags).toEqual([
      expect.objectContaining({ tag_id: "t_free", tag_group: "status" }),
    ]);
  });

  it("renaming a template unlinks the old tag without deleting it", async () => {
    const { syncBillingTags } = await import("../src/server/core/tags");
    const db = memoryDb({ ...catalog, mod_billing_subscriptions: [sub()] });
    await syncBillingTags(db.admin, USER);
    await syncBillingTags(db.admin, USER, {
      store: { template: "Bought on {store}" },
    });
    expect(db.tagsOf(USER)).toContain("Bought on Web");
    expect(db.tagsOf(USER)).not.toContain("Store: Web");
    expect(db.tables.tags?.some((t) => t.name === "Store: Web")).toBe(true);
  });
});
