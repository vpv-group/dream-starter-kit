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
  /**
   * Whether the promotion code can be redeemed. Off deactivates it at Stripe;
   * back on reactivates it (Stripe allows that while the coupon is valid).
   */
  active: boolean;
  /** Resolved Stripe product ids this coupon is restricted to (empty = all). */
  appliesToProductIds?: string[];
  stripeCouponId?: string | null;
  stripePromotionCodeId?: string | null;
}

export interface CouponSyncResult {
  stripeCouponId: string;
  stripePromotionCodeId: string | null;
}

/** The Stripe ids a deleted plan carried (see retirePlanInStripe). */
export interface PlanRetireInput {
  stripeProductId?: string | null;
  stripePriceId?: string | null;
  stripeIntroCouponId?: string | null;
}

/** The Stripe ids a deleted coupon carried (see retireCouponInStripe). */
export interface CouponRetireInput {
  stripeCouponId?: string | null;
  stripePromotionCodeId?: string | null;
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

export async function syncPlanToStripe(
  stripe: Stripe,
  plan: PlanSyncInput,
): Promise<PlanSyncResult> {
  const metadata = { payloadId: String(plan.id), payloadCollection: "plans" };

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

/** Run a Stripe call, treating "No such …" (already gone) as done. */
async function unlessMissing(call: () => Promise<unknown>): Promise<void> {
  try {
    await call();
  } catch (err) {
    if (!isMissingResource(err)) throw err;
  }
}

/** The coupon id a promotion code redeems (expanded or not). */
function promotionCouponId(promo: Stripe.PromotionCode): string | null {
  const c = promo.promotion.coupon;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

// --- Coupon sync ----------------------------------------------------------

export async function syncCouponToStripe(
  stripe: Stripe,
  coupon: CouponSyncInput,
): Promise<CouponSyncResult> {
  const metadata = {
    payloadId: String(coupon.id),
    payloadCollection: "coupons",
  };
  const months = durationInMonths(coupon);
  const productIds = coupon.appliesToProductIds ?? [];
  const redeemBy = toUnixSeconds(coupon.redeemBy);

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
      if (reuse)
        await stripe.coupons.update(couponId, { name: coupon.name, metadata });
    } catch {
      reuse = false;
    }
  }
  if (!reuse) {
    if (couponId) await stripe.coupons.del(couponId).catch(() => undefined);
    const created = await stripe.coupons.create(desired);
    couponId = created.id;
  }

  // Promotion code — the code customers type. Stripe won't change a code's
  // text or coupon, so the stored code is kept only while both still match;
  // otherwise (coupon recreated, code renamed or cleared) it is deactivated —
  // a stale code would stay redeemable and block reusing its text — and a new
  // one is minted. `active` maps onto the code's own active flag.
  const code = coupon.code?.trim() ?? "";
  let promoId = coupon.stripePromotionCodeId ?? null;
  let live: Stripe.PromotionCode | null = null;
  if (promoId) {
    try {
      live = await stripe.promotionCodes.retrieve(promoId);
    } catch (err) {
      if (!isMissingResource(err)) throw err;
      promoId = null; // gone (e.g. the site moved Stripe accounts)
    }
  }
  const keep =
    live !== null &&
    code !== "" &&
    live.code.toLowerCase() === code.toLowerCase() &&
    promotionCouponId(live) === couponId;

  if (live && keep) {
    if (live.active !== coupon.active) {
      await stripe.promotionCodes.update(live.id, { active: coupon.active });
    }
  } else {
    if (live?.active) {
      const old = live.id;
      try {
        await stripe.promotionCodes.update(old, { active: false });
      } catch (err) {
        // A code whose coupon was just deleted can't be redeemed anyway.
        if (reuse && !isMissingResource(err)) throw err;
      }
    }
    promoId = null;
    if (code) {
      const promo = await stripe.promotionCodes.create({
        promotion: { type: "coupon", coupon: couponId },
        code,
        active: coupon.active,
        ...(coupon.maxRedemptions
          ? { max_redemptions: coupon.maxRedemptions }
          : {}),
        ...(redeemBy ? { expires_at: redeemBy } : {}),
        metadata,
      });
      promoId = promo.id;
    }
  }

  return { stripeCouponId: couponId, stripePromotionCodeId: promoId };
}

// --- Retire (the Payload doc was deleted) ---------------------------------

/**
 * Run every step, then throw the first real failure: one step failing must
 * not leave the others undone. Already-gone resources count as done.
 */
async function allSteps(steps: (() => Promise<unknown>)[]): Promise<void> {
  let first: Error | null = null;
  for (const step of steps) {
    try {
      await unlessMissing(step);
    } catch (err) {
      first ??= err instanceof Error ? err : new Error(String(err));
    }
  }
  if (first) throw first;
}

/**
 * A deleted plan: archive its product (an archived product can't be bought,
 * and Stripe keeps billing existing subscriptions on its prices) and price,
 * and delete its intro-offer coupon (subscriptions that already have the
 * intro discount keep it). Products with prices can't be deleted, so they're
 * archived — the webhook mirrors that into mod_billing_products/prices.
 */
export async function retirePlanInStripe(
  stripe: Stripe,
  plan: PlanRetireInput,
): Promise<void> {
  const { stripeProductId, stripePriceId, stripeIntroCouponId } = plan;
  await allSteps([
    ...(stripeProductId
      ? [() => stripe.products.update(stripeProductId, { active: false })]
      : []),
    ...(stripePriceId
      ? [
          () =>
            stripe.prices
              .update(stripePriceId, { active: false })
              // Stripe may refuse to archive a product's default price; the
              // archived product already stops new purchases.
              .catch(() => undefined),
        ]
      : []),
    ...(stripeIntroCouponId
      ? [() => stripe.coupons.del(stripeIntroCouponId)]
      : []),
  ]);
}

/**
 * A deleted coupon: deactivate its promotion code (so it can't be typed in
 * at Checkout) and delete the Stripe coupon (so it can't be applied at all).
 * Subscriptions that already carry the discount keep it — Stripe applies a
 * deleted coupon to existing subscriptions until its duration ends.
 */
export async function retireCouponInStripe(
  stripe: Stripe,
  coupon: CouponRetireInput,
): Promise<void> {
  const { stripeCouponId, stripePromotionCodeId } = coupon;
  await allSteps([
    ...(stripePromotionCodeId
      ? [
          () =>
            stripe.promotionCodes.update(stripePromotionCodeId, {
              active: false,
            }),
        ]
      : []),
    ...(stripeCouponId ? [() => stripe.coupons.del(stripeCouponId)] : []),
  ]);
}
