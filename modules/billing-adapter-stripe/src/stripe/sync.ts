import type Stripe from "stripe";

/**
 * Push Payload-authored plans and coupons into Stripe — called automatically
 * on save by billing's catalog hook through this adapter (server/catalog.ts).
 * Stripe prices and coupons are
 * **immutable** for their core fields — you cannot change a price's amount or
 * a coupon's discount/duration. So when those change we CREATE a new resource
 * and ARCHIVE the old one, keeping the Payload doc pointed at the current
 * Stripe id. Name/description/metadata are updated in place.
 *
 * The Stripe webhook (server/webhook.ts) mirrors the resulting
 * products/prices back into mod_billing_products/prices, so this is the
 * write side of a one-way Payload → Stripe → DB pipeline. Every Stripe object
 * carries `metadata.payloadId` so we can re-link if a stored id is ever lost.
 *
 * The functions take an injected `Stripe` client and plain input shapes (mapped
 * from the Payload docs by the caller) so the immutable-resource logic stays
 * unit-testable without Payload's generated types or a live Stripe key.
 */

export interface PlanSyncInput {
  id: string | number;
  name: string;
  description?: string | null;
  pricingType: "recurring" | "one_time";
  interval?: "day" | "week" | "month" | "year" | null;
  /** Bill every N intervals (Stripe `interval_count`, default 1). */
  intervalCount?: number | null;
  /** Amount in the smallest currency unit (cents). */
  unitAmount: number;
  currency: string;
  active: boolean;
  introOffer?: {
    enabled?: boolean | null;
    introAmount?: number | null;
    /** Unit for `introPeriods` (years count as 12 months). */
    introInterval?: "month" | "year" | null;
    /** How many intro periods the discount lasts (1 = first invoice only). */
    introPeriods?: number | null;
  } | null;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
  stripeIntroCouponId?: string | null;
  /**
   * This site's tag (its host), stored as `metadata.payloadSite` so a resync
   * can tell this site's leftovers from another site's on a shared account.
   */
  site?: string | null;
}

export interface PlanSyncResult {
  stripeProductId: string;
  stripePriceId: string;
  stripeIntroCouponId: string | null;
}

export interface CouponSyncInput {
  id: string | number;
  name: string;
  discountType: "percent_off" | "amount_off";
  value: number;
  currency?: string | null;
  duration: "once" | "repeating" | "forever";
  durationCount?: number | null;
  durationUnit?: "month" | "year" | null;
  maxRedemptions?: number | null;
  /** ISO date string; becomes Stripe `redeem_by` (seconds). */
  redeemBy?: string | null;
  /** Optional customer-facing promotion code (e.g. LAUNCH20). */
  code?: string | null;
  /** Resolved Stripe product ids this coupon is restricted to (empty = all). */
  appliesToProductIds?: string[];
  stripeCouponId?: string | null;
  stripePromotionCodeId?: string | null;
  /**
   * Whether the coupon is on (default true). Off turns its promotion code off
   * at checkout; discounts already applied keep applying.
   */
  active?: boolean | null;
  /** This site's tag — see PlanSyncInput.site. */
  site?: string | null;
}

export interface CouponSyncResult {
  stripeCouponId: string;
  stripePromotionCodeId: string | null;
}

// --- Pure helpers (exported for unit tests) -------------------------------

/**
 * Convert a repeating coupon's duration (N months or N years) into Stripe's
 * months-only `duration_in_months`. e.g. 6 months → 6; 2 years → 24.
 */
export function durationInMonths(input: CouponSyncInput): number | undefined {
  if (input.duration !== "repeating") return undefined;
  const count = Math.max(1, Math.floor(input.durationCount ?? 1));
  return input.durationUnit === "year" ? count * 12 : count;
}

/** ISO date → unix seconds (Stripe uses second-precision timestamps). */
export function toUnixSeconds(iso?: string | null): number | undefined {
  if (!iso) return undefined;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/**
 * Whether the live Stripe price diverges from the desired plan pricing and must
 * be re-created (prices are immutable). Compares amount, currency, and the
 * recurring interval / one-time-ness.
 */
export function priceNeedsRecreate(
  live: Pick<Stripe.Price, "unit_amount" | "currency" | "recurring" | "active">,
  plan: PlanSyncInput,
): boolean {
  if (!live.active) return true;
  if (live.unit_amount !== plan.unitAmount) return true;
  if (live.currency !== plan.currency.toLowerCase()) return true;
  const wantRecurring = plan.pricingType === "recurring";
  const liveRecurring = Boolean(live.recurring);
  if (wantRecurring !== liveRecurring) return true;
  if (wantRecurring && live.recurring?.interval !== (plan.interval ?? "month"))
    return true;
  if (
    wantRecurring &&
    (live.recurring?.interval_count ?? 1) !== (plan.intervalCount ?? 1)
  )
    return true;
  return false;
}

/**
 * The Stripe coupon duration for a plan's intro offer: one intro period =
 * `once`; more = `repeating` for N months (years × 12 — Stripe only takes
 * months).
 */
export function introCouponDuration(
  plan: PlanSyncInput,
):
  { duration: "once" } | { duration: "repeating"; duration_in_months: number } {
  const periods = Math.max(1, Math.floor(plan.introOffer?.introPeriods ?? 1));
  const unit = plan.introOffer?.introInterval ?? "month";
  const months = unit === "year" ? periods * 12 : periods;
  if (months <= 1) return { duration: "once" };
  return { duration: "repeating", duration_in_months: months };
}

/** The amount_off (cents) for a plan's intro offer, or null when not applicable. */
export function introAmountOff(plan: PlanSyncInput): number | null {
  if (plan.pricingType !== "recurring") return null;
  if (!plan.introOffer?.enabled) return null;
  const intro = plan.introOffer.introAmount;
  if (intro == null) return null;
  const off = plan.unitAmount - intro;
  return off > 0 ? off : null;
}

// --- Plan sync ------------------------------------------------------------

/** Stripe's "No such …" error: the id doesn't exist in this account. */
function isMissingResource(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "resource_missing"
  );
}

/** Await a Stripe call, treating "No such …" as already done. */
async function ignoreMissing(call: Promise<unknown>): Promise<void> {
  try {
    await call;
  } catch (err) {
    if (!isMissingResource(err)) throw err;
  }
}

/** The `metadata` every synced Stripe object carries. */
function payloadMetadata(
  collection: "plans" | "coupons",
  id: string | number,
  site?: string | null,
): Record<string, string> {
  return {
    payloadId: String(id),
    payloadCollection: collection,
    ...(site ? { payloadSite: site } : {}),
  };
}

export async function syncPlanToStripe(
  stripe: Stripe,
  plan: PlanSyncInput,
): Promise<PlanSyncResult> {
  const metadata = payloadMetadata("plans", plan.id, plan.site);

  // 1. Product — created if missing, otherwise updated in place. A stored id
  // that no longer resolves (the site moved to another Stripe account, or the
  // product was deleted in the Dashboard) gets a new product, and its price
  // goes with it: a price can't move to another product.
  let productId = plan.stripeProductId ?? "";
  let productRecreated = false;
  const productData: Stripe.ProductUpdateParams = {
    name: plan.name,
    description: plan.description?.trim() ? plan.description : undefined,
    active: plan.active,
    metadata,
  };
  if (productId) {
    try {
      await stripe.products.update(productId, productData);
    } catch (err) {
      if (!isMissingResource(err)) throw err;
      productId = "";
    }
  }
  if (!productId) {
    const product = await stripe.products.create({
      ...(productData as Stripe.ProductCreateParams),
      name: plan.name,
    });
    productId = product.id;
    productRecreated = Boolean(plan.stripeProductId);
  }

  // 2. Price — immutable, so create a new one + archive the old when it diverges.
  let priceId = plan.stripePriceId ?? "";
  let recreate = !priceId || productRecreated;
  if (priceId && !recreate) {
    try {
      const live = await stripe.prices.retrieve(priceId);
      recreate = priceNeedsRecreate(live, plan);
    } catch {
      recreate = true; // stored id no longer resolves
    }
  }
  if (recreate) {
    const newPrice = await stripe.prices.create({
      product: productId,
      currency: plan.currency.toLowerCase(),
      unit_amount: plan.unitAmount,
      recurring:
        plan.pricingType === "recurring"
          ? {
              interval: plan.interval ?? "month",
              interval_count: Math.max(1, Math.floor(plan.intervalCount ?? 1)),
            }
          : undefined,
      metadata,
    });
    await stripe.products.update(productId, { default_price: newPrice.id });
    if (priceId && !productRecreated) {
      await stripe.prices.update(priceId, { active: false }).catch(() => {
        // Old price may already be archived/missing — ignore.
      });
    }
    priceId = newPrice.id;
  }

  // 3. Intro offer — a coupon applied automatically at checkout: `once` for a
  // single intro period, `repeating` (N months) for longer intro pricing.
  let introCouponId = plan.stripeIntroCouponId ?? null;
  const amountOff = introAmountOff(plan);
  if (amountOff != null) {
    const introDuration = introCouponDuration(plan);
    const desired = {
      amount_off: amountOff,
      currency: plan.currency.toLowerCase(),
      ...introDuration,
      name: `${plan.name} — intro offer`,
      metadata,
    };
    let reuse = false;
    if (introCouponId) {
      try {
        const live = await stripe.coupons.retrieve(introCouponId);
        reuse =
          live.valid &&
          live.amount_off === amountOff &&
          live.currency === desired.currency &&
          live.duration === introDuration.duration &&
          (introDuration.duration !== "repeating" ||
            live.duration_in_months === introDuration.duration_in_months);
        if (reuse)
          await stripe.coupons.update(introCouponId, { name: desired.name });
      } catch {
        reuse = false;
      }
    }
    if (!reuse) {
      const coupon = await stripe.coupons.create(desired);
      introCouponId = coupon.id;
    }
  } else if (introCouponId) {
    // Intro offer turned off — drop the coupon (existing subs are unaffected).
    await stripe.coupons.del(introCouponId).catch(() => undefined);
    introCouponId = null;
  }

  return {
    stripeProductId: productId,
    stripePriceId: priceId,
    stripeIntroCouponId: introCouponId,
  };
}

// --- Coupon sync ----------------------------------------------------------

/** Promotion codes are case-insensitive at checkout. */
function sameCode(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

export async function syncCouponToStripe(
  stripe: Stripe,
  coupon: CouponSyncInput,
): Promise<CouponSyncResult> {
  const metadata = payloadMetadata("coupons", coupon.id, coupon.site);
  const months = durationInMonths(coupon);
  const productIds = coupon.appliesToProductIds ?? [];
  const redeemBy = toUnixSeconds(coupon.redeemBy);
  const active = coupon.active ?? true;
  const code = coupon.code?.trim() ?? "";

  const desired: Stripe.CouponCreateParams = {
    name: coupon.name,
    duration: coupon.duration,
    ...(coupon.duration === "repeating" ? { duration_in_months: months } : {}),
    ...(coupon.discountType === "percent_off"
      ? { percent_off: coupon.value }
      : {
          amount_off: coupon.value,
          currency: (coupon.currency ?? "usd").toLowerCase(),
        }),
    ...(coupon.maxRedemptions
      ? { max_redemptions: coupon.maxRedemptions }
      : {}),
    ...(redeemBy ? { redeem_by: redeemBy } : {}),
    ...(productIds.length ? { applies_to: { products: productIds } } : {}),
    metadata,
  };

  // Coupons are immutable for discount/duration → recreate when those change.
  let couponId = coupon.stripeCouponId ?? "";
  let reuse = false;
  if (couponId) {
    try {
      const live = await stripe.coupons.retrieve(couponId);
      reuse =
        live.valid &&
        live.duration === coupon.duration &&
        (live.duration !== "repeating" || live.duration_in_months === months) &&
        (coupon.discountType === "percent_off"
          ? live.percent_off === coupon.value
          : live.amount_off === coupon.value &&
            live.currency === (coupon.currency ?? "usd").toLowerCase());
    } catch {
      reuse = false;
    }
  }

  // The stored promotion code. Stripe can't change a code's text or coupon,
  // so it's kept only while the coupon is reused and the code is unchanged;
  // otherwise it's turned off (before a new one is created: a code must be
  // unique among active codes) and a fresh code is minted below.
  let livePromo: Stripe.PromotionCode | null = null;
  if (coupon.stripePromotionCodeId) {
    try {
      livePromo = await stripe.promotionCodes.retrieve(
        coupon.stripePromotionCodeId,
      );
    } catch (err) {
      if (!isMissingResource(err)) throw err;
    }
  }
  const keepPromo =
    livePromo !== null &&
    reuse &&
    code !== "" &&
    sameCode(livePromo.code, code);
  if (livePromo && !keepPromo && livePromo.active) {
    await ignoreMissing(
      stripe.promotionCodes.update(livePromo.id, { active: false }),
    );
  }

  if (reuse) {
    await stripe.coupons.update(couponId, { name: coupon.name, metadata });
  } else {
    if (couponId) await stripe.coupons.del(couponId).catch(() => undefined);
    const created = await stripe.coupons.create(desired);
    couponId = created.id;
  }

  // Promotion code: follow the coupon's on/off state (discounts already
  // applied to subscriptions are unaffected either way).
  let promoId: string | null = null;
  if (keepPromo && livePromo) {
    promoId = livePromo.id;
    if (livePromo.active !== active) {
      await stripe.promotionCodes.update(promoId, { active });
    }
  } else if (code) {
    const promo = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: couponId },
      code,
      active,
      ...(coupon.maxRedemptions
        ? { max_redemptions: coupon.maxRedemptions }
        : {}),
      ...(redeemBy ? { expires_at: redeemBy } : {}),
      metadata,
    });
    promoId = promo.id;
  }

  return { stripeCouponId: couponId, stripePromotionCodeId: promoId };
}

// --- Retiring deleted plans and coupons -----------------------------------

export interface PlanRetireInput {
  stripeProductId?: string | null;
  stripePriceId?: string | null;
  stripeIntroCouponId?: string | null;
}

export interface CouponRetireInput {
  stripeCouponId?: string | null;
  stripePromotionCodeId?: string | null;
}

/**
 * A deleted plan: archive its product and price (Stripe never deletes a
 * product that has prices) and delete its intro coupon. Subscriptions already
 * on the price keep renewing. Ids that no longer resolve count as done.
 */
export async function retirePlanInStripe(
  stripe: Stripe,
  plan: PlanRetireInput,
): Promise<void> {
  const productId = plan.stripeProductId ?? "";
  const priceId = plan.stripePriceId ?? "";
  if (productId) {
    await ignoreMissing(stripe.products.update(productId, { active: false }));
  }
  if (priceId) {
    try {
      await ignoreMissing(stripe.prices.update(priceId, { active: false }));
    } catch (err) {
      // A product's default price must stay active: clear it, then retry.
      if (!productId) throw err;
      await ignoreMissing(
        stripe.products.update(productId, { default_price: "" }),
      );
      await ignoreMissing(stripe.prices.update(priceId, { active: false }));
    }
  }
  if (plan.stripeIntroCouponId) {
    await ignoreMissing(stripe.coupons.del(plan.stripeIntroCouponId));
  }
}

/**
 * A deleted coupon: turn its promotion code off, then delete the Stripe
 * coupon. Discounts already applied to subscriptions keep applying. Ids that
 * no longer resolve count as done.
 */
export async function retireCouponInStripe(
  stripe: Stripe,
  coupon: CouponRetireInput,
): Promise<void> {
  if (coupon.stripePromotionCodeId) {
    await ignoreMissing(
      stripe.promotionCodes.update(coupon.stripePromotionCodeId, {
        active: false,
      }),
    );
  }
  if (coupon.stripeCouponId) {
    await ignoreMissing(stripe.coupons.del(coupon.stripeCouponId));
  }
}

// --- Resync: retire leftovers of deleted plans/coupons --------------------

export interface OrphanSweepInput {
  /** This site's tag (`metadata.payloadSite`); other sites' objects are left alone. */
  site: string;
  /** Ids of every plan / coupon that still exists in the CMS. */
  planIds: ReadonlySet<string>;
  couponIds: ReadonlySet<string>;
}

export interface OrphanSweepResult {
  plans: number;
  coupons: number;
}

/** At most this many list pages per object type (100 items each). */
const MAX_PAGES = 50;

/** Every item of a paginated Stripe list (bounded by MAX_PAGES). */
async function listAll<T extends { id: string }>(
  page: (startingAfter?: string) => Promise<Stripe.ApiList<T>>,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await page(after);
    out.push(...res.data);
    const last = res.data.at(-1);
    if (!res.has_more || !last) break;
    after = last.id;
  }
  return out;
}

/**
 * Retire the Stripe objects this site created for plans and coupons that no
 * longer exist in the CMS — the leftovers of a delete whose Stripe cleanup
 * failed (deletes have no `syncStatus` to show the failure on). Only objects
 * tagged with this site (`metadata.payloadSite`) are touched, so another site
 * sharing the Stripe account keeps its catalog; untagged objects (created
 * before the tag existed, and since deleted) are left for the Dashboard.
 */
export async function retireStripeOrphans(
  stripe: Stripe,
  input: OrphanSweepInput,
): Promise<OrphanSweepResult> {
  const result: OrphanSweepResult = { plans: 0, coupons: 0 };
  const orphan = (
    metadata: Stripe.Metadata | null | undefined,
    collection: "plans" | "coupons",
  ): boolean => {
    if (metadata?.payloadSite !== input.site) return false;
    if (metadata.payloadCollection !== collection) return false;
    const id = metadata.payloadId;
    if (!id) return false;
    return !(collection === "plans" ? input.planIds : input.couponIds).has(id);
  };

  const products = await listAll((starting_after) =>
    stripe.products.list({ active: true, limit: 100, starting_after }),
  );
  for (const product of products) {
    if (!orphan(product.metadata, "plans")) continue;
    const price = product.default_price;
    await retirePlanInStripe(stripe, {
      stripeProductId: product.id,
      stripePriceId: typeof price === "string" ? price : (price?.id ?? null),
    });
    result.plans += 1;
  }

  const coupons = await listAll((starting_after) =>
    stripe.coupons.list({ limit: 100, starting_after }),
  );
  for (const coupon of coupons) {
    // A deleted plan's intro coupon carries the plan's metadata.
    if (orphan(coupon.metadata, "plans")) {
      await ignoreMissing(stripe.coupons.del(coupon.id));
      continue;
    }
    if (!orphan(coupon.metadata, "coupons")) continue;
    const promos = await listAll((starting_after) =>
      stripe.promotionCodes.list({
        coupon: coupon.id,
        active: true,
        limit: 100,
        starting_after,
      }),
    );
    for (const promo of promos) {
      await retireCouponInStripe(stripe, { stripePromotionCodeId: promo.id });
    }
    await retireCouponInStripe(stripe, { stripeCouponId: coupon.id });
    result.coupons += 1;
  }
  return result;
}
