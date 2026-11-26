import { defineAdapterSettings } from "@acme/mod-kit/payload";

/**
 * The "Stripe" tab on Modules → Billing (contributed to billing's settings;
 * staff-only even though billing's pricing tab is public). Credentials are
 * NOT here: "Connect with Stripe" (the connector panel below the tabs) or
 * your own STRIPE_SECRET_KEY in env (golden rule #3).
 */
export const settings = defineAdapterSettings({
  slug: "billing-adapter-stripe",
  // Stored as billing's `adapter_stripe` group (short: Postgres 63-char names).
  key: "stripe",
  name: "Stripe",
  target: "billing",
  description:
    "Checkout options for Stripe. Connect your Stripe account in the Stripe " +
    "panel below (or set STRIPE_SECRET_KEY, which takes priority).",
  fields: [
    {
      name: "enabled",
      type: "checkbox",
      label: "Take payments with Stripe",
      defaultValue: true,
      admin: {
        description:
          "Off: new checkouts and catalog sync stop. The webhook keeps " +
          "recording changes to existing Stripe subscriptions.",
      },
    },
    {
      name: "hostedCheckout",
      type: "checkbox",
      label: "Send buyers to Stripe's hosted Checkout page",
      defaultValue: false,
      admin: {
        description:
          "Off (default): buyers pay on the site — /checkout and the paywall " +
          "(card, Link, Apple Pay / Google Pay). On: they're redirected to Stripe.",
      },
    },
    {
      name: "expressWallets",
      type: "checkbox",
      label: "Offer Apple Pay / Google Pay buttons",
      defaultValue: true,
      admin: {
        description:
          "Embedded checkout only. Apple Pay also needs your domain " +
          "verified in Stripe (Settings → Payment method domains).",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "allowPromotionCodes",
          type: "checkbox",
          label: "Promotion code box",
          defaultValue: true,
          admin: {
            width: "50%",
            description:
              "Hosted Checkout. Hidden when a plan's intro offer applies " +
              "(Stripe allows one discount).",
          },
        },
        {
          name: "automaticTax",
          type: "checkbox",
          label: "Stripe Tax",
          defaultValue: false,
          admin: {
            width: "50%",
            description:
              "Hosted Checkout: calculate tax automatically (needs Stripe " +
              "Tax set up in your Stripe account).",
          },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "requireBillingAddress",
          type: "checkbox",
          label: "Always ask for a billing address",
          defaultValue: false,
          admin: {
            width: "50%",
            description: "Hosted Checkout (otherwise only when needed).",
          },
        },
        {
          name: "phoneNumberCollection",
          type: "checkbox",
          label: "Ask for a phone number",
          defaultValue: false,
          admin: { width: "50%", description: "Hosted Checkout." },
        },
      ],
    },
  ],
});

export interface StripeAdapterSettings extends Record<string, unknown> {
  enabled: boolean;
  hostedCheckout: boolean;
  expressWallets: boolean;
  allowPromotionCodes: boolean;
  automaticTax: boolean;
  requireBillingAddress: boolean;
  phoneNumberCollection: boolean;
}
