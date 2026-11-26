import type {
  SupabaseClient as BaseSupabaseClient,
  User,
} from "@supabase/supabase-js";
import type { BasePayload, CollectionAfterChangeHook } from "payload";

import type { Database } from "@acme/api";
import type { ModBillingCoupon, ModBillingPlan } from "@acme/cms";
import type { ModPublicRouteTable } from "@acme/mod-kit/server";

/** The service-role client (bypasses RLS — server only, golden rule #2). */
export type AdminClient = BaseSupabaseClient<Database>;

/** Where a purchase was made. Web = the site's own checkout (e.g. Stripe). */
export type BillingStore = "web" | "app_store" | "play_store" | "promotional";

/** Purchase environment, when the provider says (sandbox = store test). */
export type BillingEnvironment = "live" | "test" | "sandbox";

/**
 * The ledger's subscription statuses (Stripe's vocabulary, which the SQL check
 * constraint enforces). Adapters map their provider's states onto these:
 * e.g. a store "billing issue / grace period" → past_due, "expired" →
 * canceled.
 */
export type BillingStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

/** Statuses that grant the entitlement (same as the mod_billing_entitlements view). */
export const ACTIVE_STATUSES: readonly BillingStatus[] = ["active", "trialing"];

/**
 * One subscription or one-time purchase, in provider-neutral form — what an
 * adapter hands `applySubscription()`. `id` is the provider's id, which must
 * be unique across providers (Stripe's `sub_…`/`cs_…` are; other adapters
 * prefix theirs, e.g. `rc:<transaction>`).
 */
export interface NormalizedSubscription {
  provider: string;
  id: string;
  userId: string;
  priceId: string | null;
  status: BillingStatus;
  quantity?: number | null;
  cancelAtPeriodEnd?: boolean;
  /** ISO time; null for lifetime / one-time purchases. */
  currentPeriodEnd: string | null;
  kind?: "subscription" | "one_time";
  /** The Payload plan id (mod-billing-plans), when the adapter knows it. */
  planId?: string | null;
  /** What it unlocks; defaults to premium (see plans.entitlement). */
  entitlement?: "members" | "premium";
  store?: BillingStore;
  environment?: BillingEnvironment | null;
}

/** A catalog product, provider-scoped (its id is the provider's). */
export interface CatalogProduct {
  provider: string;
  id: string;
  active: boolean;
  name: string;
  description?: string | null;
  image?: string | null;
  metadata?: Record<string, string>;
}

/** A catalog price, provider-scoped. */
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

/** A past invoice/receipt, as `/billing` lists it. */
export interface BillingInvoice {
  id: string;
  provider: string;
  number: string | null;
  amountPaid: number;
  currency: string;
  status: string | null;
  /** Unix seconds. */
  created: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

export type ClaimResult = "claimed" | "duplicate" | "busy";

/** Payload `afterChange` args for a plan or coupon save. */
export type CatalogSyncArgs = Parameters<CollectionAfterChangeHook>[0];

export interface CheckoutInput {
  plan: ModBillingPlan;
  /** The signed-in buyer, or null for a guest checkout. */
  user: User | null;
  /** The site's public origin, for return URLs. */
  origin: string;
}

/** A provider's admin status, shown on Modules → Billing. */
export interface ProviderStatus {
  configured: boolean;
  /** Short state label, e.g. "Connected via Meet Dream", "Own API keys". */
  summary: string;
  detail?: string | null;
}

/**
 * A payment provider's SERVER contract — what the billing core calls out to.
 * Exported as `adapter` from an adapter module's `./server` entry (manifest
 * `adapter: { for: "billing", server: true }`). Everything is optional except
 * identity + `isConfigured`, so a store-only provider (in-app purchases, no
 * web checkout) implements just what it supports.
 */
export interface BillingProvider {
  /** Stable id, stored as `provider` on ledger rows, e.g. "stripe". */
  id: string;
  label: string;
  /** Where it can take payment. Web checkout picks a provider with "web". */
  platforms: ("web" | "ios" | "android")[];
  /** Keys/connection present and the provider is switched on. */
  isConfigured(): Promise<boolean>;
  /** Hosted checkout for a plan (redirect URL). */
  createCheckout?(input: CheckoutInput): Promise<{ url: string }>;
  /** Self-serve management (change/cancel, payment method). */
  createPortalSession?(input: {
    userId: string;
    origin: string;
  }): Promise<{ url: string } | null>;
  /** Past invoices for `/billing`. */
  listInvoices?(input: { userId: string }): Promise<BillingInvoice[]>;
  /** Push a saved plan to the provider's catalog (Payload afterChange). */
  /** Returns the doc as re-saved with the provider ids, if it re-saved it. */
  syncPlan?(args: CatalogSyncArgs): Promise<unknown>;
  /** Push a saved coupon to the provider (Payload afterChange). */
  syncCoupon?(args: CatalogSyncArgs): Promise<unknown>;
  /** Cancel what the user still pays for before their account is deleted. */
  onAccountDelete?(input: { userId: string }): Promise<void>;
  /** For the admin panel. */
  status?(): Promise<ProviderStatus>;
  /**
   * Routes billing still serves under its own path for one release while
   * endpoints registered by billing 1.x (e.g. Stripe's webhook at
   * /api/mod/billing/stripe/webhook) move to the adapter's path.
   */
  legacyRoutes?: ModPublicRouteTable;
}

/** Context the host passes to billing's services. */
export interface BillingServiceContext {
  getPayload: () => Promise<BasePayload>;
}

export type { ModBillingCoupon, ModBillingPlan };
