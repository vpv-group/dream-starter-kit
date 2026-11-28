/**
 * Billing's catalog hooks: a deleted plan/coupon is handed to every
 * installed provider that can retire it, unless the doc or the request opted
 * out of provider sync — and a provider failure never fails the delete.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingProvider } from "../src/server/core/types";
import {
  retireCouponWithProviders,
  retirePlanWithProviders,
} from "../src/payload/hooks/sync-with-providers";

const state = vi.hoisted(() => ({
  providers: [] as unknown[],
  loadError: null as Error | null,
}));

vi.mock("../src/server/core/providers", () => ({
  getBillingProviders: () =>
    state.loadError
      ? Promise.reject(state.loadError)
      : Promise.resolve(state.providers),
}));

function provider(over: Partial<BillingProvider> = {}): BillingProvider {
  return {
    id: "fake",
    label: "Fake",
    platforms: ["web"],
    isConfigured: () => Promise.resolve(true),
    ...over,
  };
}

const logger = { error: vi.fn(), warn: vi.fn() };

type HookArgs = Parameters<typeof retireCouponWithProviders>[0];

function args(doc: object, context: Record<string, unknown> = {}): HookArgs {
  return {
    doc,
    id: (doc as { id: number }).id,
    req: { payload: { logger } },
    context,
    collection: {},
  } as unknown as HookArgs;
}

beforeEach(() => {
  state.providers = [];
  state.loadError = null;
  logger.error.mockClear();
  logger.warn.mockClear();
});

describe("retireCouponWithProviders", () => {
  it("hands the deleted coupon to each provider's deleteCoupon", async () => {
    const deleteCoupon = vi.fn(() => Promise.resolve());
    const other = provider({ id: "store" }); // no deleteCoupon: skipped
    state.providers = [provider({ deleteCoupon }), other];
    const doc = { id: 7, stripeCouponId: "coupon_1" };
    const a = args(doc);

    await expect(retireCouponWithProviders(a)).resolves.toBe(doc);
    expect(deleteCoupon).toHaveBeenCalledWith(a);
  });

  it("respects skipSync and the skipProviderSync context", async () => {
    const deleteCoupon = vi.fn(() => Promise.resolve());
    state.providers = [provider({ deleteCoupon })];

    await retireCouponWithProviders(args({ id: 1, skipSync: true }));
    await retireCouponWithProviders(
      args({ id: 2 }, { skipProviderSync: true }),
    );
    await retireCouponWithProviders(args({ id: 3 }, { skipStripeSync: true }));
    expect(deleteCoupon).not.toHaveBeenCalled();
  });

  it("logs a provider failure and still runs the other providers", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("boom")));
    const ok = vi.fn(() => Promise.resolve());
    state.providers = [
      provider({ id: "a", deleteCoupon: failing }),
      provider({ id: "b", deleteCoupon: ok }),
    ];

    await expect(
      retireCouponWithProviders(args({ id: 9 })),
    ).resolves.toBeDefined();
    expect(ok).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      expect.anything(),
      "billing: a could not retire deleted coupon 9",
    );
  });

  it("warns when the providers can't be loaded (e.g. the Payload CLI)", async () => {
    state.loadError = new Error("server-only");
    await expect(
      retireCouponWithProviders(args({ id: 4 })),
    ).resolves.toBeDefined();
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe("retirePlanWithProviders", () => {
  it("hands the deleted plan to each provider's deletePlan", async () => {
    const deletePlan = vi.fn(() => Promise.resolve());
    const deleteCoupon = vi.fn(() => Promise.resolve());
    state.providers = [provider({ deletePlan, deleteCoupon })];
    const a = args({ id: 3, stripeProductId: "prod_1" });

    await retirePlanWithProviders(a as never);
    expect(deletePlan).toHaveBeenCalledWith(a);
    expect(deleteCoupon).not.toHaveBeenCalled();
  });
});
