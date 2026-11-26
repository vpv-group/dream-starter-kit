import type { Config } from "payload";

/**
 * The billing module contributes no Payload plugins. Stripe → app sync is ONE
 * webhook (POST /api/mod/billing/stripe/webhook — src/server/stripe/webhook.ts)
 * that writes public.mod_billing_* and projects subscriptions into the CMS;
 * plans/coupons sync to Stripe via their afterChange hooks
 * (./hooks/sync-*-to-stripe.ts). @payloadcms/plugin-stripe (and its second
 * endpoint + secret) is no longer used.
 */
export const plugins: NonNullable<Config["plugins"]> = [];
