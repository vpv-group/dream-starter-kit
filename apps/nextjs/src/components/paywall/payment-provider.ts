"use client";

import type { ComponentType, ReactNode } from "react";

import { useModAdapters } from "@acme/mod-kit/react";

import type { BuyerDetails } from "~/lib/paywall-copy";

/**
 * The installed web payment provider for billing (e.g. Stripe), found through
 * the module adapter registry — the host never imports a payment provider.
 *
 * These types are a STRUCTURAL copy of billing's web payment contract
 * (modules/billing/src/payment.ts: `BillingWebProvider`); host code may not
 * import modules, so keep the two in step.
 */

/** Presentation of the paywall: full-screen, bottom sheet, or on-page dock. */
export type CheckoutVariant = "full" | "sheet" | "dock";

export type PayMethod = "wallet" | "card";

export interface PurchaseRef {
  subscriptionId?: string;
  customerId?: string;
}

export interface PaidResult extends PurchaseRef {
  intentId?: string;
  details?: BuyerDetails;
}

export interface CreatedPurchase extends PurchaseRef {
  clientSecret: string;
  mode: "payment" | "setup";
}

export interface PaymentPlan {
  id: string | number;
  pricingType?: string | null;
  unitAmount?: number | null;
  currency?: string | null;
  trialDays?: number | null;
  introOffer?: { enabled?: boolean | null; introAmount?: number | null } | null;
}

export interface PaymentFormProps {
  planId: string | number;
  plan: PaymentPlan;
  variant: "paywall" | "checkout";
  cta: string;
  fineprint: ReactNode;
  initialMethod?: PayMethod;
  beforeCreate?: () => Promise<void>;
  createPurchase?: (details?: BuyerDetails) => Promise<CreatedPurchase>;
  onBack?: () => void;
  onPaid: (result: PaidResult) => void;
}

export interface WebPaymentProvider {
  id: string;
  label: string;
  PaymentForm: ComponentType<PaymentFormProps>;
  completeGuestPurchase?: (input: {
    email: string;
    name?: string | null;
    phone?: string | null;
    address?: Record<string, unknown> | null;
    ref: PurchaseRef;
  }) => Promise<{ loginToken?: string }>;
  switchPlan?: (input: {
    planId: string | number;
    ref: PurchaseRef;
    email?: string;
  }) => Promise<void>;
  preconnect?: string[];
  prefetch?: () => void;
}

/** The first installed web payment provider, or null (billing unconfigured). */
export function useWebPaymentProvider(): WebPaymentProvider | null {
  return useModAdapters<WebPaymentProvider>("billing")[0]?.adapter ?? null;
}
