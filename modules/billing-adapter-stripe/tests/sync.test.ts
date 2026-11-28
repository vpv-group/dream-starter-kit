import { describe, expect, it, vi } from "vitest";

import type { CouponSyncInput, PlanSyncInput } from "../src/stripe/sync";
import {
  durationInMonths,
  introAmountOff,
  priceNeedsRecreate,
  retireCouponInStripe,
  retirePlanInStripe,
  retireStripeOrphans,
  syncCouponToStripe,
  syncPlanToStripe,
  toUnixSeconds,
} from "../src/stripe/sync";

const basePlan: PlanSyncInput = {
  id: 1,
  name: "Dream Monthly Plan",
  pricingType: "recurring",
  interval: "month",
  unitAmount: 999,
  currency: "usd",
  active: true,
};

describe("pure helpers", () => {
  it("converts repeating duration to months (years × 12)", () => {
    const months = (c: Partial<CouponSyncInput>) =>
      durationInMonths({ duration: "repeating", ...c } as CouponSyncInput);
    expect(months({ durationCount: 6, durationUnit: "month" })).toBe(6);
    expect(months({ durationCount: 2, durationUnit: "year" })).toBe(24);
    expect(
      durationInMonths({ duration: "once" } as CouponSyncInput),
    ).toBeUndefined();
  });

  it("intro amount_off is the difference, or null when not applicable", () => {
    expect(
      introAmountOff({
        ...basePlan,
        introOffer: { enabled: true, introAmount: 199 },
      }),
    ).toBe(800);
    expect(
      introAmountOff({
        ...basePlan,
        introOffer: { enabled: false, introAmount: 199 },
      }),
    ).toBeNull();
    expect(
      introAmountOff({
        ...basePlan,
        pricingType: "one_time",
        introOffer: { enabled: true, introAmount: 1 },
      }),
    ).toBeNull();
  });

  it("toUnixSeconds converts ISO to seconds and tolerates null", () => {
    expect(toUnixSeconds("2030-01-01T00:00:00.000Z")).toBe(1893456000);
    expect(toUnixSeconds(null)).toBeUndefined();
  });

  it("priceNeedsRecreate flags amount/interval/currency divergence", () => {
    const live = {
      unit_amount: 999,
      currency: "usd",
      recurring: { interval: "month" },
      active: true,
    } as Parameters<typeof priceNeedsRecreate>[0];
    expect(priceNeedsRecreate(live, basePlan)).toBe(false);
    expect(priceNeedsRecreate({ ...live, unit_amount: 1299 }, basePlan)).toBe(
      true,
    );
    expect(priceNeedsRecreate({ ...live, active: false }, basePlan)).toBe(true);
    expect(
      priceNeedsRecreate(
        { ...live, recurring: { interval: "year" } } as typeof live,
        basePlan,
      ),
    ).toBe(true);
  });
});

const emptyList = () =>
  Promise.resolve({ object: "list", data: [] as unknown[], has_more: false });

/** Minimal Stripe mock recording calls and returning predictable ids. */
function mockStripe() {
  return {
    products: {
      create: vi.fn(() => Promise.resolve({ id: "prod_new" })),
      update: vi.fn((_id: string, _p?: unknown) => Promise.resolve({})),
      list: vi.fn((_p?: unknown) => emptyList()),
    },
    prices: {
      create: vi.fn(() => Promise.resolve({ id: "price_new" })),
      retrieve: vi.fn(),
      update: vi.fn((_id: string, _p?: unknown) => Promise.resolve({})),
    },
    coupons: {
      create: vi.fn(() => Promise.resolve({ id: "coupon_new" })),
      retrieve: vi.fn(),
      update: vi.fn(() => Promise.resolve({})),
      del: vi.fn((_id: string) => Promise.resolve({})),
      list: vi.fn((_p?: unknown) => emptyList()),
    },
    promotionCodes: {
      create: vi.fn((_p?: unknown) => Promise.resolve({ id: "promo_new" })),
      retrieve: vi.fn(),
      update: vi.fn((_id: string, _p?: unknown) => Promise.resolve({})),
      list: vi.fn((_p?: unknown) => emptyList()),
    },
  };
}

/** Stripe's "No such …" error. */
const missing = () =>
  Object.assign(new Error("No such object"), { code: "resource_missing" });

describe("syncPlanToStripe", () => {
  it("creates product + price when unsynced", async () => {
    const stripe = mockStripe();
    const res = await syncPlanToStripe(stripe as never, basePlan);
    expect(stripe.products.create).toHaveBeenCalledOnce();
    expect(stripe.prices.create).toHaveBeenCalledOnce();
    expect(res).toEqual({
      stripeProductId: "prod_new",
      stripePriceId: "price_new",
      stripeIntroCouponId: null,
    });
  });

  it("updates product but keeps price when amount is unchanged", async () => {
    const stripe = mockStripe();
    stripe.prices.retrieve.mockResolvedValue({
      unit_amount: 999,
      currency: "usd",
      recurring: { interval: "month" },
      active: true,
    });
    const res = await syncPlanToStripe(stripe as never, {
      ...basePlan,
      stripeProductId: "prod_1",
      stripePriceId: "price_1",
    });
    expect(stripe.products.update).toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(res.stripePriceId).toBe("price_1");
  });

  it("creates a new price and archives the old when amount changes", async () => {
    const stripe = mockStripe();
    stripe.prices.retrieve.mockResolvedValue({
      unit_amount: 999,
      currency: "usd",
      recurring: { interval: "month" },
      active: true,
    });
    const res = await syncPlanToStripe(stripe as never, {
      ...basePlan,
      unitAmount: 1299,
      stripeProductId: "prod_1",
      stripePriceId: "price_old",
    });
    expect(stripe.prices.create).toHaveBeenCalledOnce();
    expect(stripe.prices.update).toHaveBeenCalledWith("price_old", {
      active: false,
    });
    expect(res.stripePriceId).toBe("price_new");
  });

  it("recreates product + price when the stored product isn't in this account", async () => {
    const stripe = mockStripe();
    stripe.products.update.mockRejectedValueOnce(
      Object.assign(new Error("No such product: 'prod_old'"), {
        code: "resource_missing",
      }),
    );
    const res = await syncPlanToStripe(stripe as never, {
      ...basePlan,
      stripeProductId: "prod_old",
      stripePriceId: "price_old",
    });
    expect(stripe.products.create).toHaveBeenCalledOnce();
    // The old price belongs to the old product/account: neither read nor archived.
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
    expect(stripe.prices.update).not.toHaveBeenCalled();
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ product: "prod_new" }),
    );
    expect(res).toEqual({
      stripeProductId: "prod_new",
      stripePriceId: "price_new",
      stripeIntroCouponId: null,
    });
  });

  it("still fails on other product errors", async () => {
    const stripe = mockStripe();
    stripe.products.update.mockRejectedValueOnce(
      Object.assign(new Error("Permission denied"), {
        code: "permission_denied",
      }),
    );
    await expect(
      syncPlanToStripe(stripe as never, {
        ...basePlan,
        stripeProductId: "prod_1",
        stripePriceId: "price_1",
      }),
    ).rejects.toThrow("Permission denied");
    expect(stripe.products.create).not.toHaveBeenCalled();
  });

  it("creates a duration:once intro coupon", async () => {
    const stripe = mockStripe();
    await syncPlanToStripe(stripe as never, {
      ...basePlan,
      introOffer: { enabled: true, introAmount: 199 },
    });
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_off: 800,
        duration: "once",
        currency: "usd",
      }),
    );
  });
});

describe("syncCouponToStripe", () => {
  it("creates coupon + promotion code with months-converted duration", async () => {
    const stripe = mockStripe();
    const input: CouponSyncInput = {
      id: 5,
      name: "Launch",
      discountType: "amount_off",
      value: 1000,
      currency: "usd",
      duration: "repeating",
      durationCount: 2,
      durationUnit: "year",
      code: "LAUNCH",
      maxRedemptions: 100,
    };
    const res = await syncCouponToStripe(stripe as never, input);
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount_off: 1000, duration_in_months: 24 }),
    );
    expect(stripe.promotionCodes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "LAUNCH",
        promotion: { type: "coupon", coupon: "coupon_new" },
      }),
    );
    expect(res.stripePromotionCodeId).toBe("promo_new");
  });
});

describe("syncCouponToStripe: on/off and code changes", () => {
  const base: CouponSyncInput = {
    id: 5,
    name: "Launch",
    discountType: "percent_off",
    value: 20,
    duration: "once",
    code: "LAUNCH20",
    stripeCouponId: "co_1",
    stripePromotionCodeId: "promo_1",
  };
  /** A stored coupon that still matches (reused) and its promotion code. */
  function synced(promo: { code?: string; active?: boolean } = {}) {
    const stripe = mockStripe();
    stripe.coupons.retrieve.mockResolvedValue({
      id: "co_1",
      valid: true,
      duration: "once",
      percent_off: 20,
    });
    stripe.promotionCodes.retrieve.mockResolvedValue({
      id: "promo_1",
      code: promo.code ?? "LAUNCH20",
      active: promo.active ?? true,
    });
    return stripe;
  }

  it("turns the promotion code off when the coupon is switched off", async () => {
    const stripe = synced();
    const res = await syncCouponToStripe(stripe as never, {
      ...base,
      active: false,
    });
    expect(stripe.promotionCodes.update).toHaveBeenCalledExactlyOnceWith(
      "promo_1",
      { active: false },
    );
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
    expect(stripe.coupons.del).not.toHaveBeenCalled();
    expect(res).toEqual({
      stripeCouponId: "co_1",
      stripePromotionCodeId: "promo_1",
    });
  });

  it("turns it back on when the coupon is switched on again", async () => {
    const stripe = synced({ active: false });
    await syncCouponToStripe(stripe as never, { ...base, active: true });
    expect(stripe.promotionCodes.update).toHaveBeenCalledExactlyOnceWith(
      "promo_1",
      { active: true },
    );
  });

  it("leaves a code that already matches alone (case-insensitive)", async () => {
    const stripe = synced({ code: "launch20" });
    await syncCouponToStripe(stripe as never, base);
    expect(stripe.promotionCodes.update).not.toHaveBeenCalled();
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
  });

  it("creates the code turned off for a coupon that starts off", async () => {
    const stripe = mockStripe();
    await syncCouponToStripe(stripe as never, {
      id: 5,
      name: "Launch",
      discountType: "percent_off",
      value: 20,
      duration: "once",
      code: "LAUNCH20",
      active: false,
    });
    expect(stripe.promotionCodes.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: "LAUNCH20", active: false }),
    );
  });

  it("retires the old code before minting a changed one", async () => {
    const stripe = synced();
    const order: string[] = [];
    stripe.promotionCodes.update.mockImplementation((id: string) => {
      order.push(`off ${id}`);
      return Promise.resolve({});
    });
    stripe.promotionCodes.create.mockImplementation((p?: unknown) => {
      order.push(`create ${(p as { code: string }).code}`);
      return Promise.resolve({ id: "promo_new" });
    });
    const res = await syncCouponToStripe(stripe as never, {
      ...base,
      code: "LAUNCH30",
    });
    expect(order).toEqual(["off promo_1", "create LAUNCH30"]);
    expect(res.stripePromotionCodeId).toBe("promo_new");
    expect(stripe.coupons.del).not.toHaveBeenCalled();
  });

  it("retires the code when it's cleared", async () => {
    const stripe = synced();
    const res = await syncCouponToStripe(stripe as never, {
      ...base,
      code: "  ",
    });
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
    expect(res.stripePromotionCodeId).toBeNull();
  });

  it("retires the old code before recreating a changed coupon", async () => {
    const stripe = synced();
    const order: string[] = [];
    stripe.promotionCodes.update.mockImplementation((id: string) => {
      order.push(`off ${id}`);
      return Promise.resolve({});
    });
    stripe.coupons.del.mockImplementation((id: string) => {
      order.push(`del ${id}`);
      return Promise.resolve({});
    });
    stripe.promotionCodes.create.mockImplementation(() => {
      order.push("create");
      return Promise.resolve({ id: "promo_new" });
    });
    const res = await syncCouponToStripe(stripe as never, {
      ...base,
      value: 30,
    });
    expect(order).toEqual(["off promo_1", "del co_1", "create"]);
    expect(res).toEqual({
      stripeCouponId: "coupon_new",
      stripePromotionCodeId: "promo_new",
    });
  });

  it("mints a new code when the stored one no longer exists", async () => {
    const stripe = synced();
    stripe.promotionCodes.retrieve.mockRejectedValue(missing());
    const res = await syncCouponToStripe(stripe as never, base);
    expect(stripe.promotionCodes.update).not.toHaveBeenCalled();
    expect(res.stripePromotionCodeId).toBe("promo_new");
  });

  it("fails the sync when the old code can't be turned off", async () => {
    const stripe = synced();
    stripe.promotionCodes.update.mockRejectedValue(new Error("rate limited"));
    await expect(
      syncCouponToStripe(stripe as never, { ...base, active: false }),
    ).rejects.toThrow("rate limited");
  });

  it("tags synced objects with the site", async () => {
    const stripe = mockStripe();
    await syncCouponToStripe(stripe as never, {
      ...base,
      stripeCouponId: null,
      stripePromotionCodeId: null,
      site: "abc.supabase.co",
    });
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          payloadId: "5",
          payloadCollection: "coupons",
          payloadSite: "abc.supabase.co",
        },
      }),
    );
  });
});

describe("retiring deleted plans and coupons", () => {
  it("turns a deleted coupon's code off, then deletes the coupon", async () => {
    const stripe = mockStripe();
    await retireCouponInStripe(stripe as never, {
      stripeCouponId: "co_1",
      stripePromotionCodeId: "promo_1",
    });
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(stripe.coupons.del).toHaveBeenCalledWith("co_1");
  });

  it("treats ids Stripe no longer has as already retired", async () => {
    const stripe = mockStripe();
    stripe.promotionCodes.update.mockRejectedValue(missing());
    stripe.coupons.del.mockRejectedValue(missing());
    await expect(
      retireCouponInStripe(stripe as never, {
        stripeCouponId: "co_1",
        stripePromotionCodeId: "promo_1",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws other errors so billing can log them", async () => {
    const stripe = mockStripe();
    stripe.coupons.del.mockRejectedValue(new Error("Stripe is down"));
    await expect(
      retireCouponInStripe(stripe as never, { stripeCouponId: "co_1" }),
    ).rejects.toThrow("Stripe is down");
  });

  it("archives a deleted plan's product and price, drops its intro coupon", async () => {
    const stripe = mockStripe();
    await retirePlanInStripe(stripe as never, {
      stripeProductId: "prod_1",
      stripePriceId: "price_1",
      stripeIntroCouponId: "co_intro",
    });
    expect(stripe.products.update).toHaveBeenCalledWith("prod_1", {
      active: false,
    });
    expect(stripe.prices.update).toHaveBeenCalledWith("price_1", {
      active: false,
    });
    expect(stripe.coupons.del).toHaveBeenCalledWith("co_intro");
  });

  it("clears the default price when Stripe won't archive it", async () => {
    const stripe = mockStripe();
    stripe.prices.update.mockRejectedValueOnce(
      Object.assign(new Error("default price"), { code: "parameter_invalid" }),
    );
    await retirePlanInStripe(stripe as never, {
      stripeProductId: "prod_1",
      stripePriceId: "price_1",
    });
    expect(stripe.products.update).toHaveBeenCalledWith("prod_1", {
      default_price: "",
    });
    expect(stripe.prices.update).toHaveBeenCalledTimes(2);
  });
});

describe("retireStripeOrphans", () => {
  const site = "abc.supabase.co";
  const meta = (collection: string, id: string, s = site) => ({
    payloadId: id,
    payloadCollection: collection,
    payloadSite: s,
  });

  it("retires only this site's objects whose plan/coupon is gone", async () => {
    const stripe = mockStripe();
    stripe.products.list.mockResolvedValue({
      object: "list",
      has_more: false,
      data: [
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
      ],
    });
    stripe.coupons.list.mockResolvedValue({
      object: "list",
      has_more: false,
      data: [
        { id: "co_kept", metadata: meta("coupons", "10") },
        { id: "co_gone", metadata: meta("coupons", "11") },
        { id: "co_intro_gone", metadata: meta("plans", "2") },
      ],
    });
    stripe.promotionCodes.list.mockResolvedValue({
      object: "list",
      has_more: false,
      data: [{ id: "promo_gone" }],
    });

    const res = await retireStripeOrphans(stripe as never, {
      site,
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
      .mockResolvedValueOnce({
        object: "list",
        has_more: true,
        data: [{ id: "prod_a", metadata: {} }],
      })
      .mockResolvedValueOnce({
        object: "list",
        has_more: false,
        data: [{ id: "prod_b", metadata: {} }],
      });
    await retireStripeOrphans(stripe as never, {
      site,
      planIds: new Set(),
      couponIds: new Set(),
    });
    expect(stripe.products.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ starting_after: "prod_a" }),
    );
  });
});
