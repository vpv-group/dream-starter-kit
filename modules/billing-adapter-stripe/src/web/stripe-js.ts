"use client";

import type { Stripe } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";

/** What the browser needs to mount Elements (GET /config). */
export interface StripeClientConfig {
  enabled: boolean;
  publishableKey: string | null;
  stripeAccount: string | null;
  checkoutExperience: "embedded" | "hosted";
  expressWallets: boolean;
}

const API = "/api/mod/billing-adapter-stripe";

let configPromise: Promise<StripeClientConfig> | null = null;

/**
 * The connected account's public config, fetched once per page load: the
 * publishable key comes from whichever credential is in use (your own keys or
 * "Connect with Stripe"), so connecting needs no rebuild.
 */
export function getStripeConfig(): Promise<StripeClientConfig> {
  configPromise ??= fetch(`${API}/config`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`config ${res.status}`);
      return (await res.json()) as StripeClientConfig;
    })
    .catch((err: unknown) => {
      configPromise = null; // retry on the next call
      throw err;
    });
  return configPromise;
}

let stripePromise: Promise<Stripe | null> | null = null;

/** Stripe.js for the connected account, loaded once (null: not connected). */
export function getStripePromise(): Promise<Stripe | null> {
  stripePromise ??= getStripeConfig()
    .then((c) =>
      c.publishableKey
        ? loadStripe(
            c.publishableKey,
            c.stripeAccount ? { stripeAccount: c.stripeAccount } : undefined,
          )
        : null,
    )
    .catch(() => {
      stripePromise = null;
      return null;
    });
  return stripePromise;
}
