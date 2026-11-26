"use client";

import dynamic from "next/dynamic";

import type { BillingWebProvider, PaymentFormProps } from "@acme/mod-billing";

import { completeGuestPurchase, switchPlan } from "./api";

/**
 * Stripe's web side of billing (manifest `adapter.web`): the payment step the
 * paywall and /checkout render through `useModAdapters("billing")`, plus the
 * follow-ups for embedded purchases. Client-safe (no server imports).
 *
 * This entry is in every page's bundle (the generated client registry imports
 * it), so Stripe.js and Elements load LAZILY: the form is a dynamic chunk,
 * fetched when a paywall/checkout first renders it or `prefetch()` runs.
 */
const PaymentForm = dynamic<PaymentFormProps>(
  () => import("./payment-form").then((m) => m.PaymentForm),
  { ssr: false },
);

export const webProvider: BillingWebProvider = {
  id: "stripe",
  label: "Stripe",
  PaymentForm,
  completeGuestPurchase,
  switchPlan,
  // Warm TLS/DNS for Stripe.js + its API for visitors who see a paywall.
  preconnect: [
    "https://js.stripe.com",
    "https://api.stripe.com",
    "https://m.stripe.network",
  ],
  prefetch: () => {
    void import("./payment-form");
    void import("./stripe-js")
      .then((m) => m.getStripePromise())
      .catch(() => undefined);
  },
};
