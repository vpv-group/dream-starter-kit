import "server-only";

import type Stripe from "stripe";

import type {
  BillingInvoice,
  BillingProvider,
  ProviderStatus,
} from "@acme/mod-billing/server";
import {
  BillingError,
  createAdminClient,
  findUserCustomer,
} from "@acme/mod-billing/server";

import {
  getStripeOrNull,
  stripeCredentials,
  stripeSettings,
} from "../stripe/client";
import { syncCoupon, syncPlan } from "./catalog";
import { resolveCustomer } from "./customers";
import { legacyRoutes } from "./legacy";

/**
 * Stripe as billing's web payment provider — the `adapter` billing calls out
 * to (`getModAdapters("billing")`): hosted Checkout, the customer portal,
 * invoices, catalog sync, cleanup before account deletion, and the admin
 * status line.
 */

async function enabledStripe(): Promise<Stripe | null> {
  if (!(await stripeSettings()).enabled) return null;
  return await getStripeOrNull();
}

export const adapter: BillingProvider = {
  id: "stripe",
  label: "Stripe",
  platforms: ["web"],

  async isConfigured() {
    if (!(await stripeSettings()).enabled) return false;
    return (await stripeCredentials()).status === "ok";
  },

  /** Hosted Stripe Checkout for a plan (guest buyers welcome). */
  async createCheckout({ plan, user, origin }) {
    const stripe = await enabledStripe();
    if (!stripe) throw new BillingError(503, "Billing not configured");
    if (!plan.stripePriceId) {
      throw new BillingError(
        409,
        "This plan isn't available for purchase yet.",
      );
    }
    const settings = await stripeSettings();
    const isSubscription = plan.pricingType === "recurring";

    // Reuse the signed-in user's Stripe customer (validated + healed if the
    // saved id is stale); guests pass no customer so Checkout collects the
    // email and the webhook creates the account from it.
    const customerId = await resolveCustomer(stripe, user);

    // An intro offer is auto-applied via its duration:once coupon. Otherwise
    // allow promotion codes when enabled (Stripe forbids combining the two).
    const introCoupon = isSubscription ? plan.stripeIntroCouponId : null;
    const metadata: Record<string, string> = {
      plan_id: String(plan.id),
      ...(user ? { supabase_user_id: user.id } : {}),
    };

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: isSubscription ? "subscription" : "payment",
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      metadata,
      success_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      billing_address_collection: settings.requireBillingAddress
        ? "required"
        : "auto",
      ...(settings.phoneNumberCollection
        ? { phone_number_collection: { enabled: true } }
        : {}),
      ...(settings.automaticTax ? { automatic_tax: { enabled: true } } : {}),
      ...(customerId ? { customer: customerId } : {}),
      ...(customerId && settings.automaticTax
        ? { customer_update: { address: "auto", name: "auto" } }
        : {}),
      ...(user ? { client_reference_id: user.id } : {}),
      ...(introCoupon
        ? { discounts: [{ coupon: introCoupon }] }
        : settings.allowPromotionCodes
          ? { allow_promotion_codes: true }
          : {}),
    };

    if (isSubscription) {
      params.subscription_data = {
        metadata,
        ...(plan.trialDays ? { trial_period_days: plan.trialDays } : {}),
      };
    } else {
      // One-time (lifetime): ensure a Customer exists so the webhook can link it.
      params.payment_intent_data = { metadata };
      if (!customerId) params.customer_creation = "always";
    }

    const session = await stripe.checkout.sessions.create(params);
    if (!session.url) throw new BillingError(502, "Stripe returned no URL");
    return { url: session.url };
  },

  /** The Stripe customer portal (change plan, cancel, payment method). */
  async createPortalSession({ userId, origin }) {
    const customerId = await findUserCustomer(
      createAdminClient(),
      userId,
      "stripe",
    );
    if (!customerId) return null;
    const stripe = await getStripeOrNull();
    if (!stripe) throw new BillingError(503, "Billing not configured");
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/a`,
    });
    return { url: session.url };
  },

  async listInvoices({ userId }): Promise<BillingInvoice[]> {
    const customerId = await findUserCustomer(
      createAdminClient(),
      userId,
      "stripe",
    );
    if (!customerId) return [];
    const stripe = await getStripeOrNull();
    if (!stripe) return [];
    const list = await stripe.invoices.list({
      customer: customerId,
      limit: 24,
    });
    return list.data.map((inv) => ({
      id: inv.id,
      provider: "stripe",
      number: inv.number,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      created: inv.created,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
    }));
  },

  syncPlan,
  syncCoupon,

  /** Cancel what the user still pays for (account deletion). */
  async onAccountDelete({ userId }) {
    const customerId = await findUserCustomer(
      createAdminClient(),
      userId,
      "stripe",
    );
    if (!customerId) return;
    const stripe = await getStripeOrNull();
    if (!stripe) return;
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
    });
    await Promise.all(
      subs.data
        .filter((s) => s.status !== "canceled")
        .map((s) => stripe.subscriptions.cancel(s.id)),
    );
  },

  async status(): Promise<ProviderStatus> {
    const settings = await stripeSettings();
    const creds = await stripeCredentials();
    if (creds.status !== "ok") {
      return {
        configured: false,
        summary: "Not connected",
        detail: creds.message,
      };
    }
    const c = creds.credentials;
    const mode = c.livemode === null ? "" : c.livemode ? " (live)" : " (test)";
    return {
      configured: settings.enabled,
      summary: settings.enabled
        ? c.source === "env"
          ? `Own API keys${mode}`
          : `Connected via Meet Dream${mode}`
        : "Switched off",
      detail: c.accountName ?? c.accountId,
    };
  },

  legacyRoutes,
};
