/**
 * The catalog hooks' Stripe side (server/catalog.ts): a coupon's on/off state
 * reaches its promotion code, deletes retire plans/coupons, and the resync
 * sweep is scoped to this site. Stripe and the adapter settings are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CatalogDeleteArgs,
  CatalogSyncArgs,
} from "@acme/mod-billing/server";

const state = vi.hoisted((): { enabled: boolean; stripe: unknown } => ({
  enabled: true,
  stripe: null,
}));

vi.mock("../src/stripe/client", () => ({
  stripeSettings: () => Promise.resolve({ enabled: state.enabled }),
  getStripeOrNull: () => Promise.resolve(state.stripe),
}));

const { catalogSiteTag, deleteCoupon, deletePlan, retireOrphans, syncCoupon } =
  await import("../src/server/catalog");

function fakeStripe() {
  const list = () =>
    Promise.resolve({ object: "list", data: [] as unknown[], has_more: false });
  return {
    products: { update: vi.fn(() => Promise.resolve({})), list: vi.fn(list) },
    prices: { update: vi.fn(() => Promise.resolve({})) },
    coupons: {
      retrieve: vi.fn(() =>
        Promise.resolve({
          id: "co_1",
          valid: true,
          duration: "once",
          percent_off: 20,
        }),
      ),
      update: vi.fn(() => Promise.resolve({})),
      del: vi.fn(() => Promise.resolve({})),
      list: vi.fn(list),
    },
    promotionCodes: {
      retrieve: vi.fn(() =>
        Promise.resolve({ id: "promo_1", code: "LAUNCH20", active: true }),
      ),
      update: vi.fn(() => Promise.resolve({})),
      create: vi.fn(() => Promise.resolve({ id: "promo_new" })),
      list: vi.fn(list),
    },
  };
}

const coupon = {
  id: 5,
  name: "Launch",
  discountType: "percent_off",
  value: 20,
  duration: "once",
  code: "LAUNCH20",
  stripeCouponId: "co_1",
  stripePromotionCodeId: "promo_1",
};

function fakeReq() {
  const payload = {
    logger: { error: vi.fn(), warn: vi.fn() },
    findByID: vi.fn(() => Promise.resolve({ ...coupon, appliesTo: [] })),
    update: vi.fn((op: { data: unknown }) => Promise.resolve(op.data)),
    find: vi.fn(),
  };
  return { payload };
}

beforeEach(() => {
  state.enabled = true;
  state.stripe = fakeStripe();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const stripe = () => state.stripe as ReturnType<typeof fakeStripe>;

describe("syncCoupon", () => {
  it("passes the coupon's on/off state and saves through the same req", async () => {
    const req = fakeReq();
    await syncCoupon({
      doc: { ...coupon, active: false },
      req,
      context: {},
    } as unknown as CatalogSyncArgs);
    expect(stripe().promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "mod-billing-coupons",
        req,
        data: expect.objectContaining({ syncStatus: "synced" }) as unknown,
      }),
    );
  });

  it("records a Stripe failure on syncStatus instead of throwing", async () => {
    stripe().promotionCodes.update.mockRejectedValue(new Error("Stripe down"));
    const req = fakeReq();
    await syncCoupon({
      doc: { ...coupon, active: false },
      req,
      context: {},
    } as unknown as CatalogSyncArgs);
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { syncStatus: "error", syncError: "Stripe down" },
      }),
    );
  });
});

describe("deleteCoupon / deletePlan", () => {
  const del = (doc: Record<string, unknown>) =>
    ({ doc, req: fakeReq(), context: {} }) as unknown as CatalogDeleteArgs;

  it("retires a deleted coupon", async () => {
    await deleteCoupon(del(coupon));
    expect(stripe().promotionCodes.update).toHaveBeenCalledWith("promo_1", {
      active: false,
    });
    expect(stripe().coupons.del).toHaveBeenCalledWith("co_1");
  });

  it("archives a deleted plan", async () => {
    await deletePlan(
      del({ id: 1, stripeProductId: "prod_1", stripePriceId: "price_1" }),
    );
    expect(stripe().products.update).toHaveBeenCalledWith("prod_1", {
      active: false,
    });
    expect(stripe().prices.update).toHaveBeenCalledWith("price_1", {
      active: false,
    });
  });

  it("does nothing when Stripe is switched off or the doc never synced", async () => {
    state.enabled = false;
    await deleteCoupon(del(coupon));
    state.enabled = true;
    await deletePlan(del({ id: 1 }));
    expect(stripe().coupons.del).not.toHaveBeenCalled();
    expect(stripe().products.update).not.toHaveBeenCalled();
  });

  it("throws a Stripe failure for billing to log", async () => {
    stripe().coupons.del.mockRejectedValue(new Error("Stripe down"));
    await expect(deleteCoupon(del(coupon))).rejects.toThrow("Stripe down");
  });
});

describe("retireOrphans", () => {
  it("tags by the Supabase project and passes every CMS id", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    expect(catalogSiteTag()).toBe("abc.supabase.co");
    stripe().coupons.list.mockResolvedValue({
      object: "list",
      has_more: false,
      data: [
        {
          id: "co_gone",
          metadata: {
            payloadId: "11",
            payloadCollection: "coupons",
            payloadSite: "abc.supabase.co",
          },
        },
        {
          id: "co_kept",
          metadata: {
            payloadId: "10",
            payloadCollection: "coupons",
            payloadSite: "abc.supabase.co",
          },
        },
      ],
    });
    const { payload } = fakeReq();
    payload.find.mockImplementation(((op: { collection: string }) =>
      Promise.resolve({
        docs: op.collection === "mod-billing-coupons" ? [{ id: 10 }] : [],
      })) as never);
    const res = await retireOrphans(payload as never);
    expect(res).toEqual({ plans: 0, coupons: 1 });
    expect(stripe().coupons.del).toHaveBeenCalledExactlyOnceWith("co_gone");
  });

  it("is a no-op when Stripe is switched off", async () => {
    state.enabled = false;
    const { payload } = fakeReq();
    await expect(retireOrphans(payload as never)).resolves.toEqual({
      plans: 0,
      coupons: 0,
    });
    expect(stripe().coupons.list).not.toHaveBeenCalled();
  });

  it("is a no-op when Stripe isn't connected", async () => {
    state.stripe = null;
    const { payload } = fakeReq();
    await expect(retireOrphans(payload as never)).resolves.toEqual({
      plans: 0,
      coupons: 0,
    });
    expect(payload.find).not.toHaveBeenCalled();
  });
});
