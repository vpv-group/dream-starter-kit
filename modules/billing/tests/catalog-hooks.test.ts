/**
 * Billing's catalog hooks: saving a plan/coupon syncs it to every payment
 * provider, deleting one retires it there. Provider-neutral — the providers
 * here are fakes registered through mod-kit's adapter registry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { setModAdaptersForTest } from "@acme/mod-kit/server";

import type {
  BillingProvider,
  CatalogDeleteArgs,
} from "../src/server/core/types";
import {
  retireCouponWithProviders,
  retirePlanWithProviders,
  syncCouponWithProviders,
} from "../src/payload/hooks/sync-with-providers";

function provider(
  id: string,
  over: Partial<BillingProvider> = {},
): BillingProvider {
  return {
    id,
    label: id,
    platforms: ["web"],
    isConfigured: () => Promise.resolve(true),
    ...over,
  };
}

function deleteArgs(
  doc: Record<string, unknown>,
  context: Record<string, unknown> = {},
) {
  const logger = { error: vi.fn(), warn: vi.fn() };
  const args = {
    doc: { id: 7, ...doc },
    id: 7,
    context,
    req: { payload: { logger } },
    collection: {},
  } as unknown as CatalogDeleteArgs;
  return { args, logger };
}

// The hooks are typed per collection; the tests pass loose docs.
type AnyHook = (args: unknown) => Promise<unknown>;
const retireCoupon = retireCouponWithProviders as unknown as AnyHook;
const retirePlan = retirePlanWithProviders as unknown as AnyHook;
const syncCoupon = syncCouponWithProviders as unknown as AnyHook;

afterEach(() => {
  setModAdaptersForTest("billing", []);
});

describe("retire on delete", () => {
  it("hands a deleted coupon to every provider that retires coupons", async () => {
    const deleteCoupon = vi.fn(() => Promise.resolve());
    setModAdaptersForTest("billing", [
      { slug: "billing-adapter-iap", adapter: provider("iap") },
      {
        slug: "billing-adapter-stripe",
        adapter: provider("stripe", { deleteCoupon }),
      },
    ]);
    const { args } = deleteArgs({ stripeCouponId: "co_1" });
    const out = await retireCoupon(args);
    expect(deleteCoupon).toHaveBeenCalledWith(args);
    expect(out).toBe(args.doc);
  });

  it("hands a deleted plan to deletePlan, not deleteCoupon", async () => {
    const deletePlan = vi.fn(() => Promise.resolve());
    const deleteCoupon = vi.fn(() => Promise.resolve());
    setModAdaptersForTest("billing", [
      {
        slug: "billing-adapter-stripe",
        adapter: provider("stripe", { deletePlan, deleteCoupon }),
      },
    ]);
    const { args } = deleteArgs({ stripeProductId: "prod_1" });
    await retirePlan(args);
    expect(deletePlan).toHaveBeenCalledOnce();
    expect(deleteCoupon).not.toHaveBeenCalled();
  });

  it("skips docs that opt out and writes that came from a sync", async () => {
    const deleteCoupon = vi.fn(() => Promise.resolve());
    setModAdaptersForTest("billing", [
      {
        slug: "billing-adapter-stripe",
        adapter: provider("stripe", { deleteCoupon }),
      },
    ]);
    await retireCoupon(deleteArgs({ skipSync: true }).args);
    await retireCoupon(deleteArgs({}, { skipProviderSync: true }).args);
    await retireCoupon(deleteArgs({}, { skipStripeSync: true }).args);
    expect(deleteCoupon).not.toHaveBeenCalled();
  });

  it("logs a provider failure (with the doc) and never fails the delete", async () => {
    const later = vi.fn(() => Promise.resolve());
    setModAdaptersForTest("billing", [
      {
        slug: "billing-adapter-a",
        adapter: provider("a", {
          deleteCoupon: () => Promise.reject(new Error("Stripe is down")),
        }),
      },
      {
        slug: "billing-adapter-b",
        adapter: provider("b", { deleteCoupon: later }),
      },
    ]);
    const { args, logger } = deleteArgs({ stripeCouponId: "co_1" });
    const doc: unknown = args.doc;
    await expect(retireCoupon(args)).resolves.toBe(doc);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ doc }),
      expect.stringContaining("a couldn't retire deleted coupon (7)"),
    );
    expect(later).toHaveBeenCalledOnce();
  });
});

describe("sync on save", () => {
  it("keeps the doc a provider re-saved, and survives a failing one", async () => {
    const resaved = { id: 7, syncStatus: "synced" };
    setModAdaptersForTest("billing", [
      {
        slug: "billing-adapter-a",
        adapter: provider("a", {
          syncCoupon: () => Promise.reject(new Error("boom")),
        }),
      },
      {
        slug: "billing-adapter-b",
        adapter: provider("b", { syncCoupon: () => Promise.resolve(resaved) }),
      },
    ]);
    const { args, logger } = deleteArgs({ active: false });
    await expect(syncCoupon(args)).resolves.toBe(resaved);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
