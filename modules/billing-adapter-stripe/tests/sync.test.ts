import { describe, expect, it, vi } from "vitest";

import type { CouponSyncInput, PlanSyncInput } from "../src/stripe/sync";
import {
  durationInMonths,
  introAmountOff,
  priceNeedsRecreate,
  retireCouponInStripe,
  retirePlanInStripe,
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

/** Minimal Stripe mock recording calls and returning predictable ids. */
function mockStripe() {
  return {
    products: {
      create: vi.fn(() => Promise.resolve({ id: "prod_new" })),
      update: vi.fn(() => Promise.resolve({})),
    },
    prices: {
      create: vi.fn(() => Promise.resolve({ id: "price_new" })),
      retrieve: vi.fn(),
      update: vi.fn(() => Promise.resolve({})),
    },
    coupons: {
      create: vi.fn(() => Promise.resolve({ id: "coupon_new" })),
      retrieve: vi.fn(),
      update: vi.fn(() => Promise.resolve({})),
      del: vi.fn(() => Promise.resolve({})),
    },
    promotionCodes: {
      create: vi.fn(() => Promise.resolve({ id: "promo_new" })),
      retrieve: vi.fn(),
      update: vi.fn(() => Promise.resolve({})),
    },
  };
}

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
      active: true,
    };
    const res = await syncCouponToStripe(stripe as never, input);
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount_off: 1000, duration_in_months: 24 }),
    );
    expect(stripe.promotionCodes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "LAUNCH",
        active: true,
        promotion: { type: "coupon", coupon: "coupon_new" },
      }),
    );
    expect(res.stripePromotionCodeId).toBe("promo_new");
  });

  /** An already-synced coupon whose live Stripe objects match `existing`. */
  const existing: CouponSyncInput = {
    id: 7,
    name: "Launch",
    discountType: "percent_off",
    value: 20,
    duration: "once",
    code: "LAUNCH20",
    active: true,
    stripeCouponId: "coupon_1",
    stripePromotionCodeId: "promo_1",
  };
  function syncedStripe(promo: { active: boolean; code?: string }) {
    const stripe = mockStripe();
    stripe.coupons.retrieve.mockResolvedValue({
      valid: true,
      duration: "once",
      percent_off: 20,
    });
    stripe.promotionCodes.retrieve.mockResolvedValue({
      id: "promo_1",
      code: promo.code ?? "LAUNCH20",
      active: promo.active,
      promotion: { type: "coupon", coupon: "coupon_1" },
    });
    return stripe;
  }

  it("creates an inactive promotion code for an inactive coupon", async () => {
    const stripe = mockStripe();
    await syncCouponToStripe(stripe as never, {
      ...existing,
      active: false,
      stripeCouponId: null,
      stripePromotionCodeId: null,
    });
    expect(stripe.promotionCodes.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: "LAUNCH20", active: false }),
    );
  });

  it("deactivates the promotion code when the coupon is set inactive", async () => {
    const stripe = syncedStripe({ active: true });
    const res = await syncCouponToStripe(stripe as never, {
      ...existing,
      active: false,
    });
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
    expect(stripe.coupons.create).not.toHaveBeenCalled();
    expect(res).toEqual({
      stripeCouponId: "coupon_1",
      stripePromotionCodeId: "promo_1",
    });
  });

  it("reactivates the promotion code when the coupon is set active again", async () => {
    const stripe = syncedStripe({ active: false });
    await syncCouponToStripe(stripe as never, existing);
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: true,
    });
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
  });

  it("leaves a promotion code alone when its state already matches", async () => {
    const stripe = syncedStripe({ active: true, code: "launch20" });
    await syncCouponToStripe(stripe as never, existing);
    expect(stripe.promotionCodes.update).not.toHaveBeenCalled();
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
  });

  it("retires the old code when the code is cleared", async () => {
    const stripe = syncedStripe({ active: true });
    const res = await syncCouponToStripe(stripe as never, {
      ...existing,
      code: "  ",
    });
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
    expect(res.stripePromotionCodeId).toBeNull();
  });

  it("retires the old code and mints a new one when the code is renamed", async () => {
    const stripe = syncedStripe({ active: true });
    const res = await syncCouponToStripe(stripe as never, {
      ...existing,
      code: "SPRING20",
    });
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(stripe.promotionCodes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "SPRING20",
        active: true,
        promotion: { type: "coupon", coupon: "coupon_1" },
      }),
    );
    expect(res.stripePromotionCodeId).toBe("promo_new");
  });

  it("deactivates the old code when the coupon is recreated", async () => {
    const stripe = syncedStripe({ active: true });
    const res = await syncCouponToStripe(stripe as never, {
      ...existing,
      value: 30, // percent_off is immutable → new coupon
    });
    expect(stripe.coupons.del).toHaveBeenCalledWith("coupon_1");
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(stripe.promotionCodes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        promotion: { type: "coupon", coupon: "coupon_new" },
      }),
    );
    expect(res).toEqual({
      stripeCouponId: "coupon_new",
      stripePromotionCodeId: "promo_new",
    });
  });

  it("mints a new code when the stored one isn't in this account", async () => {
    const stripe = syncedStripe({ active: true });
    stripe.promotionCodes.retrieve.mockRejectedValueOnce(
      Object.assign(new Error("No such promotion code"), {
        code: "resource_missing",
      }),
    );
    const res = await syncCouponToStripe(stripe as never, existing);
    expect(stripe.promotionCodes.update).not.toHaveBeenCalled();
    expect(stripe.promotionCodes.create).toHaveBeenCalledOnce();
    expect(res.stripePromotionCodeId).toBe("promo_new");
  });

  it("fails the sync when reactivation is refused", async () => {
    const stripe = syncedStripe({ active: false });
    stripe.promotionCodes.update.mockRejectedValueOnce(
      new Error("This promotion code cannot be reactivated"),
    );
    await expect(syncCouponToStripe(stripe as never, existing)).rejects.toThrow(
      "cannot be reactivated",
    );
  });
});

const missing = () =>
  Promise.reject(
    Object.assign(new Error("No such resource"), { code: "resource_missing" }),
  );

describe("retireCouponInStripe", () => {
  it("deactivates the promotion code and deletes the coupon", async () => {
    const stripe = mockStripe();
    await retireCouponInStripe(stripe as never, {
      stripeCouponId: "coupon_1",
      stripePromotionCodeId: "promo_1",
    });
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(stripe.coupons.del).toHaveBeenCalledWith("coupon_1");
  });

  it("treats objects already gone from Stripe as retired", async () => {
    const stripe = mockStripe();
    stripe.promotionCodes.update.mockImplementationOnce(missing);
    stripe.coupons.del.mockImplementationOnce(missing);
    await expect(
      retireCouponInStripe(stripe as never, {
        stripeCouponId: "coupon_1",
        stripePromotionCodeId: "promo_1",
      }),
    ).resolves.toBeUndefined();
  });

  it("still deletes the coupon when deactivating the code fails, then throws", async () => {
    const stripe = mockStripe();
    stripe.promotionCodes.update.mockRejectedValueOnce(new Error("boom"));
    await expect(
      retireCouponInStripe(stripe as never, {
        stripeCouponId: "coupon_1",
        stripePromotionCodeId: "promo_1",
      }),
    ).rejects.toThrow("boom");
    expect(stripe.coupons.del).toHaveBeenCalledWith("coupon_1");
  });

  it("does nothing for a coupon that was never synced", async () => {
    const stripe = mockStripe();
    await retireCouponInStripe(stripe as never, {});
    expect(stripe.promotionCodes.update).not.toHaveBeenCalled();
    expect(stripe.coupons.del).not.toHaveBeenCalled();
  });
});

describe("retirePlanInStripe", () => {
  it("archives the product and price and deletes the intro coupon", async () => {
    const stripe = mockStripe();
    await retirePlanInStripe(stripe as never, {
      stripeProductId: "prod_1",
      stripePriceId: "price_1",
      stripeIntroCouponId: "coupon_intro",
    });
    expect(stripe.products.update).toHaveBeenCalledWith("prod_1", {
      active: false,
    });
    expect(stripe.prices.update).toHaveBeenCalledWith("price_1", {
      active: false,
    });
    expect(stripe.coupons.del).toHaveBeenCalledWith("coupon_intro");
  });

  it("tolerates Stripe refusing to archive the default price", async () => {
    const stripe = mockStripe();
    stripe.prices.update.mockRejectedValueOnce(
      new Error("This price cannot be archived"),
    );
    await expect(
      retirePlanInStripe(stripe as never, {
        stripeProductId: "prod_1",
        stripePriceId: "price_1",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when the product can't be archived", async () => {
    const stripe = mockStripe();
    stripe.products.update.mockRejectedValueOnce(
      new Error("Permission denied"),
    );
    await expect(
      retirePlanInStripe(stripe as never, { stripeProductId: "prod_1" }),
    ).rejects.toThrow("Permission denied");
  });
});
