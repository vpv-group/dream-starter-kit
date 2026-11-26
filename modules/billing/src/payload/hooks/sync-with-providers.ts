import type { CollectionAfterChangeHook, RequestContext } from "payload";

import type { ModBillingCoupon, ModBillingPlan } from "@acme/cms";

import type { BillingProvider, CatalogSyncArgs } from "../../server/core/types";
import { getBillingProviders } from "../../server/core/providers";

/**
 * Catalog push: saving a plan or coupon hands it to every installed payment
 * provider that syncs a catalog (e.g. Stripe creates the product/price). Each
 * adapter writes its own ids + `syncStatus` back with
 * `context.skipProviderSync`, so its write doesn't re-enter this hook.
 *
 * Skipped when the doc opts out (`skipSync`) or the write came from a sync /
 * the seed (`skipProviderSync`; `skipStripeSync` is the 1.x name). A failure
 * is the adapter's to record on `syncStatus`/`syncError`; one that escapes is
 * logged, never fails the save.
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

async function runSync(
  args: CatalogSyncArgs,
  method: "syncPlan" | "syncCoupon",
  what: string,
): Promise<unknown> {
  const id = String((args.doc as { id?: unknown }).id);
  let providers: BillingProvider[];
  try {
    providers = await getBillingProviders();
  } catch (err) {
    // E.g. the Payload CLI (plain Node) can't load server-only adapters.
    args.req.payload.logger.warn(
      { err },
      `billing: payment providers unavailable — ${what} ${id} not synced`,
    );
    return args.doc;
  }
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
