import type {
  ModBillingCoupon as Coupon,
  ModBillingPlan as Plan,
} from "@acme/cms";
import type { CatalogSyncArgs } from "@acme/mod-billing/server";

import { getStripeOrNull, stripeSettings } from "../stripe/client";
import { syncCouponToStripe, syncPlanToStripe } from "../stripe/sync";

/**
 * Payload → Stripe catalog push, called by billing's plan/coupon afterChange
 * hook for every installed provider. Saving a plan creates/updates the Stripe
 * product and (prices being immutable) creates a new price + archives the old
 * one when the amount/interval changes; coupons recreate + archive on change
 * and mint a promotion code. The ids are written back (shown on the plan's
 * "Stripe" tab) with `context.skipProviderSync`, so the write doesn't re-sync.
 *
 * Skipped when Stripe is switched off or not connected. A failure is recorded
 * on `syncStatus`/`syncError` instead of failing the save.
 */

const SKIP = { skipProviderSync: true, skipStripeSync: true };

async function stripeForSync(args: CatalogSyncArgs) {
  const settings = await stripeSettings(args.req.payload, args.req);
  if (!settings.enabled) return null;
  // While the CMS is being seeded, only your own env keys sync (as before):
  // a "Connect with Stripe" lookup would hold up the seed's transactions,
  // and a fresh site isn't connected yet anyway.
  if (args.context.seeding && !process.env.STRIPE_SECRET_KEY) return null;
  return await getStripeOrNull();
}

export async function syncPlan(args: CatalogSyncArgs): Promise<unknown> {
  const { req } = args;
  const doc = args.doc as Plan;
  const stripe = await stripeForSync(args);
  if (!stripe) return undefined;
  try {
    const res = await syncPlanToStripe(stripe, {
      id: doc.id,
      name: doc.name,
      description: doc.description,
      pricingType: doc.pricingType,
      interval: doc.interval,
      intervalCount: doc.intervalCount,
      unitAmount: doc.unitAmount,
      currency: doc.currency,
      active: doc.active ?? true,
      introOffer: doc.introOffer,
      stripeProductId: doc.stripeProductId,
      stripePriceId: doc.stripePriceId,
      stripeIntroCouponId: doc.stripeIntroCouponId,
    });
    return await req.payload.update({
      collection: "mod-billing-plans",
      id: doc.id,
      data: {
        ...res,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: new Date().toISOString(),
      },
      depth: 0,
      overrideAccess: true,
      context: SKIP,
      req,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe sync failed";
    req.payload.logger.error({ err }, `plans: Stripe sync failed (${doc.id})`);
    return await req.payload
      .update({
        collection: "mod-billing-plans",
        id: doc.id,
        data: { syncStatus: "error", syncError: message },
        depth: 0,
        overrideAccess: true,
        context: SKIP,
        req,
      })
      .catch(() => doc);
  }
}

/** Stripe product ids of the plans a coupon is restricted to (empty = all). */
function resolveProductIds(appliesTo: Coupon["appliesTo"]): string[] {
  if (!Array.isArray(appliesTo)) return [];
  return appliesTo
    .map((p) => (typeof p === "object" ? (p.stripeProductId ?? null) : null))
    .filter((id): id is string => Boolean(id));
}

export async function syncCoupon(args: CatalogSyncArgs): Promise<unknown> {
  const { req } = args;
  const doc = args.doc as Coupon;
  const stripe = await stripeForSync(args);
  if (!stripe) return undefined;
  try {
    // Re-read with depth 1 so appliesTo plans carry their stripeProductId.
    const populated = await req.payload.findByID({
      collection: "mod-billing-coupons",
      id: doc.id,
      depth: 1,
      overrideAccess: true,
      req,
    });
    const res = await syncCouponToStripe(stripe, {
      id: doc.id,
      name: doc.name,
      discountType: doc.discountType,
      value: doc.value,
      currency: doc.currency,
      duration: doc.duration,
      durationCount: doc.durationCount,
      durationUnit: doc.durationUnit,
      maxRedemptions: doc.maxRedemptions,
      redeemBy: doc.redeemBy,
      code: doc.code,
      appliesToProductIds: resolveProductIds(populated.appliesTo),
      stripeCouponId: doc.stripeCouponId,
      stripePromotionCodeId: doc.stripePromotionCodeId,
    });
    return await req.payload.update({
      collection: "mod-billing-coupons",
      id: doc.id,
      data: {
        ...res,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: new Date().toISOString(),
      },
      depth: 0,
      overrideAccess: true,
      context: SKIP,
      req,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe sync failed";
    req.payload.logger.error(
      { err },
      `coupons: Stripe sync failed (${doc.id})`,
    );
    return await req.payload
      .update({
        collection: "mod-billing-coupons",
        id: doc.id,
        data: { syncStatus: "error", syncError: message },
        depth: 0,
        overrideAccess: true,
        context: SKIP,
        req,
      })
      .catch(() => doc);
  }
}
