/**
 * Retrying failed deletes: synced Stripe objects carry this site's tag
 * (`metadata.payloadSite`), and "Sync everything now" retires this site's
 * objects whose plan/coupon no longer exists in the CMS — never another
 * site's, never an untagged one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  retireStripeOrphans,
  syncCouponToStripe,
  syncPlanToStripe,
} from "../src/stripe/sync";

const client = vi.hoisted((): { stripe: unknown; enabled: boolean } => ({
  stripe: null,
  enabled: true,
}));

vi.mock("../src/stripe/client", () => ({
  stripeSettings: () => Promise.resolve({ enabled: client.enabled }),
  getStripeOrNull: () => Promise.resolve(client.stripe),
}));

const { catalogSiteTag, retireOrphans } = await import("../src/server/catalog");

const SITE = "abc.supabase.co";

const page = (data: unknown[], hasMore = false) =>
  Promise.resolve({ object: "list", data, has_more: hasMore });

function mockStripe() {
  return {
    products: {
      create: vi.fn(() => Promise.resolve({ id: "prod_new" })),
      update: vi.fn((_id: string, _p?: unknown) => Promise.resolve({})),
      list: vi.fn((_p?: unknown) => page([])),
    },
    prices: {
      create: vi.fn(() => Promise.resolve({ id: "price_new" })),
      retrieve: vi.fn(),
      update: vi.fn((_id: string, _p?: unknown) => Promise.resolve({})),
    },
    coupons: {
      create: vi.fn((_p?: unknown) => Promise.resolve({ id: "coupon_new" })),
      retrieve: vi.fn(),
      update: vi.fn(() => Promise.resolve({})),
      del: vi.fn((_id: string) => Promise.resolve({})),
      list: vi.fn((_p?: unknown) => page([])),
    },
    promotionCodes: {
      create: vi.fn(() => Promise.resolve({ id: "promo_new" })),
      retrieve: vi.fn(),
      update: vi.fn((_id: string, _p?: unknown) => Promise.resolve({})),
      list: vi.fn((_p?: unknown) => page([])),
    },
  };
}

const meta = (collection: string, id: string, site = SITE) => ({
  payloadId: id,
  payloadCollection: collection,
  payloadSite: site,
});

describe("site tag", () => {
  it("is stored on synced plans and coupons", async () => {
    const stripe = mockStripe();
    await syncPlanToStripe(stripe as never, {
      id: 1,
      name: "Monthly",
      pricingType: "recurring",
      interval: "month",
      unitAmount: 999,
      currency: "usd",
      active: true,
      site: SITE,
    });
    expect(stripe.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: meta("plans", "1") }),
    );
    await syncCouponToStripe(stripe as never, {
      id: 5,
      name: "Launch",
      discountType: "percent_off",
      value: 20,
      duration: "once",
      active: true,
      site: SITE,
    });
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: meta("coupons", "5") }),
    );
  });

  it("is the Supabase project's host", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${SITE}`);
    expect(catalogSiteTag()).toBe(SITE);
  });
});

describe("retireStripeOrphans", () => {
  it("retires only this site's objects whose plan/coupon is gone", async () => {
    const stripe = mockStripe();
    stripe.products.list.mockReturnValue(
      page([
        { id: "prod_kept", metadata: meta("plans", "1"), default_price: "p1" },
        { id: "prod_gone", metadata: meta("plans", "2"), default_price: "p2" },
        {
          id: "prod_other_site",
          metadata: meta("plans", "2", "other.supabase.co"),
          default_price: "p3",
        },
        {
          id: "prod_untagged",
          metadata: { payloadId: "2", payloadCollection: "plans" },
          default_price: "p4",
        },
      ]),
    );
    stripe.coupons.list.mockReturnValue(
      page([
        { id: "co_kept", metadata: meta("coupons", "10") },
        { id: "co_gone", metadata: meta("coupons", "11") },
        { id: "co_intro_gone", metadata: meta("plans", "2") },
      ]),
    );
    stripe.promotionCodes.list.mockReturnValue(page([{ id: "promo_gone" }]));

    const res = await retireStripeOrphans(stripe as never, {
      site: SITE,
      planIds: new Set(["1"]),
      couponIds: new Set(["10"]),
    });

    expect(res).toEqual({ plans: 1, coupons: 1 });
    expect(stripe.products.update.mock.calls.map((c) => c[0])).toEqual([
      "prod_gone",
    ]);
    expect(stripe.prices.update).toHaveBeenCalledWith("p2", { active: false });
    expect(stripe.promotionCodes.list).toHaveBeenCalledWith(
      expect.objectContaining({ coupon: "co_gone", active: true }),
    );
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_gone", {
      active: false,
    });
    expect(stripe.coupons.del.mock.calls.map((c) => c[0])).toEqual([
      "co_gone",
      "co_intro_gone",
    ]);
  });

  it("pages through long lists", async () => {
    const stripe = mockStripe();
    stripe.products.list
      .mockReturnValueOnce(page([{ id: "prod_a", metadata: {} }], true))
      .mockReturnValueOnce(page([{ id: "prod_b", metadata: {} }]));
    await retireStripeOrphans(stripe as never, {
      site: SITE,
      planIds: new Set(),
      couponIds: new Set(),
    });
    expect(stripe.products.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ starting_after: "prod_a" }),
    );
  });
});

describe("retireOrphans (Sync everything now)", () => {
  beforeEach(() => {
    client.enabled = true;
    client.stripe = mockStripe();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${SITE}`);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const fakePayload = (couponIds: number[]) => ({
    find: vi.fn((op: { collection: string }) =>
      Promise.resolve({
        docs:
          op.collection === "mod-billing-coupons"
            ? couponIds.map((id) => ({ id }))
            : [],
      }),
    ),
  });

  it("passes every CMS id and this site's tag", async () => {
    const stripe = client.stripe as ReturnType<typeof mockStripe>;
    stripe.coupons.list.mockReturnValue(
      page([
        { id: "co_gone", metadata: meta("coupons", "11") },
        { id: "co_kept", metadata: meta("coupons", "10") },
      ]),
    );
    const res = await retireOrphans(fakePayload([10]) as never);
    expect(res).toEqual({ plans: 0, coupons: 1 });
    expect(stripe.coupons.del).toHaveBeenCalledExactlyOnceWith("co_gone");
  });

  it("does nothing when Stripe is switched off or not connected", async () => {
    client.enabled = false;
    const payload = fakePayload([]);
    expect(await retireOrphans(payload as never)).toEqual({
      plans: 0,
      coupons: 0,
    });
    client.enabled = true;
    client.stripe = null;
    expect(await retireOrphans(payload as never)).toEqual({
      plans: 0,
      coupons: 0,
    });
    expect(payload.find).not.toHaveBeenCalled();
  });
});
