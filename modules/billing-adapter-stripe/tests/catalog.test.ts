/**
 * The Payload ↔ Stripe bridge billing's catalog hooks call: a coupon's
 * `active` flag reaches its promotion code, and deleting a plan/coupon
 * retires its Stripe objects without ever failing the delete.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CatalogDeleteArgs,
  CatalogSyncArgs,
} from "@acme/mod-billing/server";

import { deleteCoupon, deletePlan, syncCoupon } from "../src/server/catalog";

const client = vi.hoisted((): { stripe: unknown; enabled: boolean } => ({
  stripe: null,
  enabled: true,
}));

vi.mock("../src/stripe/client", () => ({
  stripeSettings: () => Promise.resolve({ enabled: client.enabled }),
  getStripeOrNull: () => Promise.resolve(client.stripe),
}));

function mockStripe() {
  return {
    coupons: {
      create: vi.fn(() => Promise.resolve({ id: "coupon_new" })),
      retrieve: vi.fn(() =>
        Promise.resolve({ valid: true, duration: "once", percent_off: 20 }),
      ),
      update: vi.fn(() => Promise.resolve({})),
      del: vi.fn(() => Promise.resolve({})),
    },
    promotionCodes: {
      create: vi.fn(() => Promise.resolve({ id: "promo_new" })),
      retrieve: vi.fn(() =>
        Promise.resolve({
          id: "promo_1",
          code: "LAUNCH20",
          active: true,
          promotion: { type: "coupon", coupon: "coupon_1" },
        }),
      ),
      update: vi.fn(() => Promise.resolve({})),
    },
    products: { update: vi.fn(() => Promise.resolve({})) },
    prices: { update: vi.fn(() => Promise.resolve({})) },
  };
}

function fakePayload() {
  return {
    findByID: vi.fn(({ id }: { id: number }) =>
      Promise.resolve({ id, appliesTo: [] }),
    ),
    update: vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...coupon, ...args.data }),
    ),
    logger: { error: vi.fn(), warn: vi.fn() },
  };
}

const coupon = {
  id: 7,
  name: "Launch",
  discountType: "percent_off",
  value: 20,
  duration: "once",
  code: "LAUNCH20",
  active: false,
  stripeCouponId: "coupon_1",
  stripePromotionCodeId: "promo_1",
};

let stripe: ReturnType<typeof mockStripe>;
let payload: ReturnType<typeof fakePayload>;

function args<T>(doc: object): T {
  return { doc, req: { payload }, context: {} } as unknown as T;
}

beforeEach(() => {
  stripe = mockStripe();
  payload = fakePayload();
  client.stripe = stripe;
  client.enabled = true;
});

describe("syncCoupon", () => {
  it("deactivates the promotion code of an inactive coupon", async () => {
    await syncCoupon(args<CatalogSyncArgs>(coupon));
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(payload.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      syncStatus: "synced",
    });
  });

  it("records a refused reactivation on syncStatus instead of throwing", async () => {
    stripe.promotionCodes.retrieve.mockResolvedValueOnce({
      id: "promo_1",
      code: "LAUNCH20",
      active: false,
      promotion: { type: "coupon", coupon: "coupon_1" },
    });
    stripe.promotionCodes.update.mockRejectedValueOnce(
      new Error("cannot be reactivated"),
    );
    await syncCoupon(args<CatalogSyncArgs>({ ...coupon, active: true }));
    expect(payload.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { syncStatus: "error", syncError: "cannot be reactivated" },
      }),
    );
  });
});

describe("deleteCoupon", () => {
  it("deactivates the promotion code and deletes the Stripe coupon", async () => {
    await deleteCoupon(args<CatalogDeleteArgs>(coupon));
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(stripe.coupons.del).toHaveBeenCalledWith("coupon_1");
  });

  it("skips a coupon that never reached Stripe", async () => {
    await deleteCoupon(
      args<CatalogDeleteArgs>({
        ...coupon,
        stripeCouponId: null,
        stripePromotionCodeId: null,
      }),
    );
    expect(stripe.coupons.del).not.toHaveBeenCalled();
  });

  it("skips when Stripe is switched off", async () => {
    client.enabled = false;
    await deleteCoupon(args<CatalogDeleteArgs>(coupon));
    expect(stripe.coupons.del).not.toHaveBeenCalled();
  });

  it("logs a failure with the Stripe ids instead of throwing", async () => {
    stripe.coupons.del.mockRejectedValueOnce(new Error("Stripe is down"));
    await expect(
      deleteCoupon(args<CatalogDeleteArgs>(coupon)),
    ).resolves.toBeUndefined();
    expect(payload.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCouponId: "coupon_1",
        stripePromotionCodeId: "promo_1",
      }),
      expect.stringContaining("deleted coupon 7"),
    );
  });
});

describe("deletePlan", () => {
  it("archives the product and price", async () => {
    await deletePlan(
      args<CatalogDeleteArgs>({
        id: 3,
        stripeProductId: "prod_1",
        stripePriceId: "price_1",
        stripeIntroCouponId: null,
      }),
    );
    expect(stripe.products.update).toHaveBeenCalledWith("prod_1", {
      active: false,
    });
    expect(stripe.prices.update).toHaveBeenCalledWith("price_1", {
      active: false,
    });
  });
});
