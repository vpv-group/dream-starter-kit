import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  RequestContext,
} from "payload";

import type { ModBillingCoupon, ModBillingPlan } from "@acme/cms";

import type {
  BillingProvider,
  CatalogDeleteArgs,
  CatalogSyncArgs,
} from "../../server/core/types";
import { getBillingProviders } from "../../server/core/providers";

/**
 * Catalog push: saving a plan or coupon hands it to every installed payment
 * provider that syncs a catalog (e.g. Stripe creates the product/price). Each
 * adapter writes its own ids + `syncStatus` back with
 * `context.skipProviderSync`, so its write doesn't re-enter this hook.
 *
 * Deleting one hands the deleted doc to each provider's `deletePlan` /
 * `deleteCoupon` so it can't be bought or redeemed any more (Stripe archives
 * the product/price, deactivates the promotion code and deletes the coupon);
 * existing purchases keep their price and discount.
 *
 * Skipped when the doc opts out (`skipSync`) or the write came from a sync /
 * the seed (`skipProviderSync`; `skipStripeSync` is the 1.x name). A failure
 * is the adapter's to record on `syncStatus`/`syncError`; one that escapes is
 * logged, never fails the save. A delete has no row left to record on, so a
 * failed retire is only logged (with the provider ids, for manual cleanup).
 */
function skipped(
  context: RequestContext,
  doc: { skipSync?: boolean | null },
): boolean {
  return (
    Boolean(context.skipProviderSync) ||
    Boolean(context.skipStripeSync) ||
    Boolean(doc.skipSync)
  );
}

/** The installed providers, or null when they can't be loaded here. */
async function loadProviders(
  args: CatalogSyncArgs | CatalogDeleteArgs,
  what: string,
): Promise<BillingProvider[] | null> {
  try {
    return await getBillingProviders();
  } catch (err) {
    // E.g. the Payload CLI (plain Node) can't load server-only adapters.
    const id = String((args.doc as { id?: unknown }).id);
    args.req.payload.logger.warn(
      { err },
      `billing: payment providers unavailable — ${what} ${id} not synced`,
    );
    return null;
  }
}

async function runSync(
  args: CatalogSyncArgs,
  method: "syncPlan" | "syncCoupon",
  what: string,
): Promise<unknown> {
  const id = String((args.doc as { id?: unknown }).id);
  const providers = await loadProviders(args, what);
  if (!providers) return args.doc;
  let latest: unknown = args.doc;
  for (const provider of providers) {
    if (!provider[method]) continue;
    try {
      const out = await provider[method](args);
      if (out !== undefined) latest = out;
    } catch (err) {
      args.req.payload.logger.error(
        { err },
        `billing: ${provider.id} ${what} sync failed (${id})`,
      );
    }
  }
  return latest;
}

export const syncPlanWithProviders: CollectionAfterChangeHook<
  ModBillingPlan
> = async (args) => {
  if (skipped(args.context, args.doc)) return args.doc;
  return (await runSync(args, "syncPlan", "plan")) as ModBillingPlan;
};

export const syncCouponWithProviders: CollectionAfterChangeHook<
  ModBillingCoupon
> = async (args) => {
  if (skipped(args.context, args.doc)) return args.doc;
  return (await runSync(args, "syncCoupon", "coupon")) as ModBillingCoupon;
};

async function runDelete(
  args: CatalogDeleteArgs,
  method: "deletePlan" | "deleteCoupon",
  what: string,
): Promise<void> {
  const id = String((args.doc as { id?: unknown }).id);
  const providers = await loadProviders(args, what);
  if (!providers) return;
  for (const provider of providers) {
    if (!provider[method]) continue;
    try {
      await provider[method](args);
    } catch (err) {
      args.req.payload.logger.error(
        { err },
        `billing: ${provider.id} could not retire deleted ${what} ${id}`,
      );
    }
  }
}

export const retirePlanWithProviders: CollectionAfterDeleteHook<
  ModBillingPlan
> = async (args) => {
  if (!skipped(args.context, args.doc)) {
    await runDelete(args, "deletePlan", "plan");
  }
  return args.doc;
};

export const retireCouponWithProviders: CollectionAfterDeleteHook<
  ModBillingCoupon
> = async (args) => {
  if (!skipped(args.context, args.doc)) {
    await runDelete(args, "deleteCoupon", "coupon");
  }
  return args.doc;
};
