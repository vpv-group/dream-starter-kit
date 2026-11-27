// Pure mapping helpers for the Stripe webhook — Stripe event objects → the
// billing core's provider-neutral shapes (NormalizedSubscription, catalog
// rows). Free of SDK/runtime imports so they're unit-tested directly
// (tests/ here and tooling/edge-tests).
//
// Inputs are *structural subsets* of the Stripe SDK objects — only the fields
// the handlers actually read — so Stripe.Product/Price/Subscription/Session
// satisfy them without a hard dependency on the SDK's types.

// Local, structural copies of billing's NormalizedSubscription / Catalog*
// shapes (@acme/mod-billing/server) — importing them would drag billing's
// server types into tooling/edge-tests, which tests this file standalone.
type BillingStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export interface NormalizedSubscription {
  provider: string;
  id: string;
  userId: string;
  priceId: string | null;
  status: BillingStatus;
  quantity?: number | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd: string | null;
  kind?: "subscription" | "one_time";
  planId?: string | null;
  store?: "web" | "app_store" | "play_store" | "promotional";
  environment?: "live" | "test" | "sandbox" | null;
  orgId?: string | null;
}

export interface CatalogProduct {
  provider: string;
  id: string;
  active: boolean;
  name: string;
  description?: string | null;
  image?: string | null;
  metadata?: Record<string, string>;
}

export interface CatalogPrice {
  provider: string;
  id: string;
  productId: string;
  active: boolean;
  unitAmount: number | null;
  currency: string;
  type: "one_time" | "recurring";
  interval: "day" | "week" | "month" | "year" | null;
  intervalCount: number | null;
  metadata?: Record<string, string>;
}

export interface ProductInput {
  id: string;
  active: boolean;
  name: string;
  description?: string | null;
  images?: string[] | null;
  metadata: Record<string, string>;
}

export interface ProductRow {
  id: string;
  active: boolean;
  name: string;
  description: string | null;
  image: string | null;
  metadata: Record<string, string>;
}

export interface PriceInput {
  id: string;
  product: string | { id: string };
  active: boolean;
  unit_amount: number | null;
  currency: string;
  type: string;
  recurring?: { interval?: string; interval_count?: number } | null;
  metadata: Record<string, string>;
}

export interface PriceRow {
  id: string;
  product_id: string;
  active: boolean;
  unit_amount: number | null;
  currency: string;
  type: string;
  interval: string | null;
  interval_count: number | null;
  metadata: Record<string, string>;
}

export interface CheckoutSessionInput {
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  customer?: string | { id: string } | null;
}

export interface SubscriptionItemInput {
  price: { id: string; metadata?: Record<string, string> | null };
  quantity?: number | null;
  current_period_end?: number;
}

export interface SubscriptionInput {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string> | null;
  items: { data: SubscriptionItemInput[] };
  current_period_end?: number;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  price_id: string | null;
  status: string;
  quantity: number | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}

/** Stripe sends Unix seconds; the DB wants ISO timestamps (or null). */
export function isoOrNull(seconds: number | null | undefined): string | null {
  return typeof seconds === "number"
    ? new Date(seconds * 1000).toISOString()
    : null;
}

/** A `customer`/`product` field may be an id string or an expanded object. */
function idOf(ref: string | { id: string }): string {
  return typeof ref === "string" ? ref : ref.id;
}

export function mapProduct(p: ProductInput): ProductRow {
  return {
    id: p.id,
    active: p.active,
    name: p.name,
    description: p.description ?? null,
    image: p.images?.[0] ?? null,
    metadata: p.metadata,
  };
}

export function mapPrice(pr: PriceInput): PriceRow {
  return {
    id: pr.id,
    product_id: idOf(pr.product),
    active: pr.active,
    unit_amount: pr.unit_amount,
    currency: pr.currency,
    type: pr.type,
    interval: pr.recurring?.interval ?? null,
    interval_count: pr.recurring?.interval_count ?? null,
    metadata: pr.metadata,
  };
}

/** Resolve the (user, customer) pair a completed Checkout session maps to. */
export function resolveCheckoutCustomer(s: CheckoutSessionInput): {
  userId: string | null;
  customerId: string | null;
} {
  return {
    userId: s.client_reference_id ?? s.metadata?.supabase_user_id ?? null,
    customerId: s.customer == null ? null : idOf(s.customer),
  };
}

/** The Stripe customer id a subscription belongs to. */
export function subscriptionCustomerId(sub: SubscriptionInput): string {
  return idOf(sub.customer);
}

/** The workspace a subscription was bought for, if any (metadata). */
export function subscriptionOrgIdFromMetadata(
  sub: SubscriptionInput,
): string | null {
  return sub.metadata?.org_id ?? null;
}

/** A subscription's user id from its metadata, if Stripe carried it through. */
export function subscriptionUserIdFromMetadata(
  sub: SubscriptionInput,
): string | null {
  return sub.metadata?.supabase_user_id ?? null;
}

export function mapSubscription(
  sub: SubscriptionInput,
  userId: string,
): SubscriptionRow {
  const item = sub.items.data[0];
  return {
    id: sub.id,
    user_id: userId,
    price_id: item?.price.id ?? null,
    status: sub.status,
    quantity: item?.quantity ?? null,
    cancel_at_period_end: sub.cancel_at_period_end,
    // current_period_end moved onto the subscription item in recent API
    // versions; fall back to the subscription-level field for older payloads.
    current_period_end:
      isoOrNull(item?.current_period_end) ?? isoOrNull(sub.current_period_end),
  };
}

export interface BuyerEmails {
  /** Set the Stripe customer's email to this (the account email). Absent:
   *  leave the customer's email as it is. */
  customerEmail?: string;
  /** The billing email to store: the wallet/checkout email when it differs
   *  from the account email, `null` when it matches (clear it). Absent: leave
   *  the stored one as it is. */
  billingEmail?: string | null;
}

/**
 * The account (login) email is the buyer's identity: the Stripe customer's
 * email stays pinned to it, and a DIFFERENT wallet email (Apple Pay / Google
 * Pay / the Checkout email field) is kept as a billing email instead of
 * overwriting it. Compared case-insensitively. When the account email is
 * unknown (the lookup failed), nothing is changed: overwriting the customer's
 * email with the wallet one is exactly what this rule prevents.
 */
export function splitBuyerEmails(
  accountEmail: string | null | undefined,
  walletEmail: string | null | undefined,
): BuyerEmails {
  const account = accountEmail?.trim();
  const wallet = walletEmail?.trim();
  if (!account) return {};
  if (!wallet) return { customerEmail: account };
  return {
    customerEmail: account,
    billingEmail:
      wallet.toLowerCase() === account.toLowerCase() ? null : wallet,
  };
}

/** Stripe statuses the ledger stores as-is (its check constraint's list). */
const LEDGER_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

/**
 * A Stripe subscription as billing's provider-neutral purchase. The plan is
 * the Payload plan the checkout stamped (`metadata.plan_id`) or the one the
 * catalog sync stamped on the price (`metadata.payloadId`).
 */
export function normalizeSubscription(
  sub: SubscriptionInput,
  userId: string,
  opts: { livemode?: boolean | null } = {},
): NormalizedSubscription {
  const row = mapSubscription(sub, userId);
  const item = sub.items.data[0];
  return {
    provider: "stripe",
    id: row.id,
    userId,
    priceId: row.price_id,
    status: (LEDGER_STATUSES.has(row.status)
      ? row.status
      : "incomplete") as BillingStatus,
    quantity: row.quantity,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    currentPeriodEnd: row.current_period_end,
    kind: "subscription",
    planId: sub.metadata?.plan_id ?? item?.price.metadata?.payloadId ?? null,
    store: "web",
    environment: opts.livemode == null ? null : opts.livemode ? "live" : "test",
    // A workspace purchase (checkout stamped the workspace).
    orgId: sub.metadata?.org_id ?? null,
  };
}

/** Catalog rows for billing's upsertProduct / upsertPrice. */
export function normalizeProduct(p: ProductInput): CatalogProduct {
  const r = mapProduct(p);
  return {
    provider: "stripe",
    id: r.id,
    active: r.active,
    name: r.name,
    description: r.description,
    image: r.image,
    metadata: r.metadata,
  };
}

export function normalizePrice(pr: PriceInput): CatalogPrice {
  const r = mapPrice(pr);
  return {
    provider: "stripe",
    id: r.id,
    productId: r.product_id,
    active: r.active,
    unitAmount: r.unit_amount,
    currency: r.currency,
    type: r.type === "one_time" ? "one_time" : "recurring",
    interval: r.interval as CatalogPrice["interval"],
    intervalCount: r.interval_count,
    metadata: r.metadata,
  };
}

/**
 * PaymentIntent metadata `purchase` value for an on-site one-time purchase
 * (express-intent). Only those are recorded from payment_intent.succeeded:
 * subscription invoices and hosted Checkout also succeed PaymentIntents, and
 * are recorded from their own events.
 */
export const ON_SITE_ONE_TIME = "one_time_on_site";
