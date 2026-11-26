import type { ComponentType, ReactNode } from "react";

/**
 * Billing's WEB payment contract — what a payment-provider adapter's `./web`
 * exports as its `adapter.web` component (e.g. billing-adapter-stripe's
 * `webProvider`). The checkout page and the paywall render whichever
 * provider is installed through `useModAdapters("billing")`, so they hold no
 * provider code. Client-safe: types only.
 *
 * The host app can't import modules, so it keeps a structural copy of this
 * contract (apps/nextjs/src/components/paywall/payment-provider.ts) — keep
 * the two in step.
 */

/** Buyer identity captured at payment (a wallet sheet or the card form). */
export interface BuyerDetails {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Billing address (persisted as-is). */
  address?: Record<string, unknown> | null;
}

/** The plan fields a payment form needs (a `mod-billing-plans` doc subset). */
export interface PaymentPlan {
  id: string | number;
  pricingType?: string | null;
  unitAmount?: number | null;
  currency?: string | null;
  trialDays?: number | null;
  introOffer?: {
    enabled?: boolean | null;
    introAmount?: number | null;
  } | null;
}

/** Ids of what was just bought — threaded to the follow-up calls below. */
export interface PurchaseRef {
  subscriptionId?: string;
  customerId?: string;
}

export interface PaidResult extends PurchaseRef {
  /** The provider's payment/setup id, when there is one. */
  intentId?: string;
  details?: BuyerDetails;
}

/** A purchase the provider set up, ready to confirm (custom flows). */
export interface CreatedPurchase extends PurchaseRef {
  clientSecret: string;
  mode: "payment" | "setup";
}

export interface PaymentFormProps {
  planId: string | number;
  plan: PaymentPlan;
  /**
   * Buy for this workspace (company billing) — the buyer is one of its
   * owners/admins (the server checks again). Omitted: a personal purchase.
   */
  orgId?: string | null;
  /**
   * "paywall": the dark, wallet-first consent + pay screen inside the
   * paywall modal; "checkout": the inline form on /checkout.
   */
  variant: "paywall" | "checkout";
  /** Pay button label. */
  cta: string;
  /** The terms the buyer must accept before paying. */
  fineprint: ReactNode;
  /** Preselected method on the paywall ("wallet" by default). */
  initialMethod?: "wallet" | "card";
  /**
   * Runs right before the purchase is created (the host makes sure the buyer
   * has a session — an anonymous one if logged out — so it links to an
   * account). Failures are ignored; the provider's webhook still links it.
   */
  beforeCreate?: () => Promise<void>;
  /** Replace the provider's purchase creation (e.g. a one-time flow). */
  createPurchase?: (details?: BuyerDetails) => Promise<CreatedPurchase>;
  /** Paywall: back from the consent screen. */
  onBack?: () => void;
  onPaid: (result: PaidResult) => void;
}

export interface BillingWebProvider {
  /** Same id as the server adapter, e.g. "stripe". */
  id: string;
  label: string;
  /** The payment step (it mounts its own SDK, e.g. Stripe Elements). */
  PaymentForm: ComponentType<PaymentFormProps>;
  /**
   * A guest paid without a session: create (or find) their account and link
   * the purchase now. `loginToken` (a one-time magic-link token hash) signs
   * the buyer into this browser when the account was just created.
   */
  completeGuestPurchase?: (input: {
    email: string;
    name?: string | null;
    phone?: string | null;
    address?: Record<string, unknown> | null;
    ref: PurchaseRef;
  }) => Promise<{ loginToken?: string }>;
  /** One-click switch of the just-bought subscription to another plan. */
  switchPlan?: (input: {
    planId: string | number;
    ref: PurchaseRef;
    /** Guest buyers: the payment email, verified against the purchase. */
    email?: string;
  }) => Promise<void>;
  /** Origins worth preconnecting to before a paywall opens. */
  preconnect?: string[];
  /** Warm the provider's SDK (e.g. load Stripe.js) ahead of a purchase. */
  prefetch?: () => void;
}
