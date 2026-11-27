"use client";

import { useModAdapters } from "@acme/mod-kit/react";

import type { BillingWebProvider } from "../../payment";

/**
 * The installed web payment provider (e.g. Stripe), found through the module
 * adapter registry — the paywall and checkout hold no provider code. The
 * contract is billing's own (`../../payment.ts`).
 */
export type {
  BillingWebProvider as WebPaymentProvider,
  BuyerDetails,
  CreatedPurchase,
  PaidResult,
  PaymentFormProps,
  PaymentPlan,
  PurchaseRef,
} from "../../payment";

/** Presentation of the paywall: full-screen, bottom sheet, or on-page dock. */
export type CheckoutVariant = "full" | "sheet" | "dock";

export type PayMethod = "wallet" | "card";

/** The first installed web payment provider, or null (billing unconfigured). */
export function useWebPaymentProvider(): BillingWebProvider | null {
  return useModAdapters<BillingWebProvider>("billing")[0]?.adapter ?? null;
}
