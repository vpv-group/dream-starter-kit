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
 * provider that syncs a catalog (e.g. Stripe creates the product/price, and
 * turns a switched-off coupon's promotion code off). Each adapter writes its
 * own ids + `syncStatus` back with `context.skipProviderSync`, so its write
 * doesn't re-enter this hook.
 *
 * Deleting a plan or coupon tells the same providers to retire it
 * (`deletePlan`/`deleteCoupon`: e.g. Stripe archives the product + price, or
 * turns the promotion code off and deletes the coupon). The doc is gone by
 * then, so a provider failure can't land on `syncStatus`: it is logged (with
 * the doc's provider ids) and the delete still succeeds.
 *
 * Skipped when the doc opts out (`skipSync`) or the write came from a sync /
 * the seed (`skipProviderSync`; `skipStripeSync` is the 1.x name). A failure
 * is the adapter's to record on `syncStatus`/`syncError`; one that escapes is
 * logged, never fails the save or delete.
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

type CatalogArgs = CatalogSyncArgs | CatalogDeleteArgs;

/** The installed providers, or null (logged) when they can't be loaded. */
async function loadProviders(
  args: CatalogArgs,
  what: string,
): Promise<BillingProvider[] | null> {
  try {
    return await getBillingProviders();
  } catch (err) {
    // E.g. the Payload CLI (plain Node) can't load server-only adapters.
    args.req.payload.logger.warn(
      { err },
      `billing: payment providers unavailable — ${what}`,
    );
    return null;
  }
}

function docId(args: CatalogArgs): string {
  return String((args.doc as { id?: unknown }).id);
}

async function runSync(
  args: CatalogSyncArgs,
  method: "syncPlan" | "syncCoupon",
  what: string,
): Promise<unknown> {
  const id = docId(args);
  const providers = await loadProviders(args, `${what} ${id} not synced`);
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

async function runDelete(
  args: CatalogDeleteArgs,
  method: "deletePlan" | "deleteCoupon",
  what: string,
): Promise<void> {
  const id = docId(args);
  const providers = await loadProviders(
    args,
    `deleted ${what} ${id} not retired`,
  );
  if (!providers) return;
  for (const provider of providers) {
    if (!provider[method]) continue;
    try {
      await provider[method](args);
    } catch (err) {
      // Nowhere to record it: the doc is deleted. Log the doc (it carries the
      // provider ids) so the leftover can be retired by hand or by a resync.
      args.req.payload.logger.error(
        { err, doc: args.doc },
        `billing: ${provider.id} couldn't retire deleted ${what} (${id})`,
      );
    }
  }
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

export const retirePlanWithProviders: CollectionAfterDeleteHook<
  ModBillingPlan
> = async (args) => {
  if (skipped(args.context, args.doc)) return args.doc;
  await runDelete(args, "deletePlan", "plan");
  return args.doc;
};

export const retireCouponWithProviders: CollectionAfterDeleteHook<
  ModBillingCoupon
> = async (args) => {
  if (skipped(args.context, args.doc)) return args.doc;
  await runDelete(args, "deleteCoupon", "coupon");
  return args.doc;
};
