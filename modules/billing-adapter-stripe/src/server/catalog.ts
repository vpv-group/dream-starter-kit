import type { BasePayload } from "payload";

import type {
  ModBillingCoupon as Coupon,
  ModBillingPlan as Plan,
} from "@acme/cms";
import type {
  CatalogDeleteArgs,
  CatalogSyncArgs,
} from "@acme/mod-billing/server";
import { siteUrl } from "@acme/mod-billing/server";

import type { OrphanSweepResult } from "../stripe/sync";
import { getStripeOrNull, stripeSettings } from "../stripe/client";
import {
  retireCouponInStripe,
  retirePlanInStripe,
  retireStripeOrphans,
  syncCouponToStripe,
  syncPlanToStripe,
} from "../stripe/sync";

/**
 * Payload → Stripe catalog push, called by billing's plan/coupon afterChange
 * hook for every installed provider. Saving a plan creates/updates the Stripe
 * product and (prices being immutable) creates a new price + archives the old
 * one when the amount/interval changes; coupons recreate + archive on change
 * and mint a promotion code. The ids are written back (shown on the plan's
 * "Stripe" tab) with `context.skipProviderSync`, so the write doesn't re-sync.
 *
 * A coupon's `active` drives its promotion code (off = turned off at
 * checkout). Deleting a plan or coupon (billing's afterDelete hook) retires
 * it: the plan's product + price are archived, the coupon's promotion code is
 * turned off and the coupon deleted. Applied discounts and existing
 * subscriptions are unaffected.
 *
 * Skipped when Stripe is switched off or not connected. A sync failure is
 * recorded on `syncStatus`/`syncError` instead of failing the save; a delete
 * failure throws (billing logs it — the doc is gone) and the connector
 * panel's resync retires the leftover later (`retireOrphans`).
 */

const SKIP = { skipProviderSync: true, skipStripeSync: true };

/**
 * This site's tag on the Stripe objects it creates (`metadata.payloadSite`):
 * the host of its Supabase project — the database the CMS ids live in — so
 * sites sharing a Stripe account never retire each other's catalog. Falls
 * back to the site's own host.
 */
export function catalogSiteTag(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? siteUrl();
  try {
    return new URL(raw).host;
  } catch {
    return raw;
  }
}

async function stripeForSync(args: CatalogSyncArgs | CatalogDeleteArgs) {
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
      site: catalogSiteTag(),
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
      active: doc.active ?? true,
      site: catalogSiteTag(),
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

/** A deleted plan: archive its Stripe product + price, drop its intro coupon. */
export async function deletePlan(args: CatalogDeleteArgs): Promise<void> {
  const doc = args.doc as Plan;
  if (!doc.stripeProductId && !doc.stripePriceId && !doc.stripeIntroCouponId)
    return;
  const stripe = await stripeForSync(args);
  if (!stripe) return;
  await retirePlanInStripe(stripe, {
    stripeProductId: doc.stripeProductId,
    stripePriceId: doc.stripePriceId,
    stripeIntroCouponId: doc.stripeIntroCouponId,
  });
}

/** A deleted coupon: turn its promotion code off, delete the Stripe coupon. */
export async function deleteCoupon(args: CatalogDeleteArgs): Promise<void> {
  const doc = args.doc as Coupon;
  if (!doc.stripeCouponId && !doc.stripePromotionCodeId) return;
  const stripe = await stripeForSync(args);
  if (!stripe) return;
  await retireCouponInStripe(stripe, {
    stripeCouponId: doc.stripeCouponId,
    stripePromotionCodeId: doc.stripePromotionCodeId,
  });
}

/** Ids of every doc in a catalog collection (synced or not, any state). */
async function allIds(
  payload: BasePayload,
  collection: "mod-billing-plans" | "mod-billing-coupons",
): Promise<Set<string>> {
  const { docs } = await payload.find({
    collection,
    pagination: false,
    depth: 0,
    select: { name: true },
    overrideAccess: true,
  });
  return new Set(docs.map((d) => String(d.id)));
}

/**
 * Retire what this site left in Stripe for plans/coupons deleted from the CMS
 * (a delete whose Stripe cleanup failed). Run by the connector panel's
 * "Sync everything now" after it re-pushes the catalog.
 */
export async function retireOrphans(
  payload: BasePayload,
): Promise<OrphanSweepResult> {
  const none = { plans: 0, coupons: 0 };
  if (!(await stripeSettings(payload)).enabled) return none;
  const stripe = await getStripeOrNull();
  if (!stripe) return none;
  return await retireStripeOrphans(stripe, {
    site: catalogSiteTag(),
    planIds: await allIds(payload, "mod-billing-plans"),
    couponIds: await allIds(payload, "mod-billing-coupons"),
  });
}
