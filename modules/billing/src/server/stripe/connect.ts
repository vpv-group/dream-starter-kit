import "server-only";

import type { SupabaseClient as BaseSupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import type { Database } from "@acme/api";

import { resetWebhookSecretCache } from "./webhook";

type SupabaseClient = BaseSupabaseClient<Database>;

/** The events the webhook handles (src/server/stripe/webhook.ts). */
export const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] =
  [
    "product.created",
    "product.updated",
    "price.created",
    "price.updated",
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ];

export const WEBHOOK_PATH = "/api/mod/billing/stripe/webhook";

/** Endpoints from before the single-webhook consolidation. */
const LEGACY_PATHS = [
  "/functions/v1/billing-stripe-webhook",
  "/cms-api/stripe/webhooks",
];

export type ConnectResult =
  | { status: "skipped"; reason: "no_stripe_key" | "not_public" }
  | { status: "connected"; url: string; created: boolean }
  | { status: "error"; message: string };

/**
 * Register the ONE Stripe webhook endpoint through the Stripe API, so a
 * founder only pastes STRIPE_SECRET_KEY — no dashboard step, no second
 * secret. The endpoint's signing secret is returned by Stripe only at
 * creation; it is stored in Supabase Vault (mod_billing_set_webhook_secret)
 * and read by the webhook. Idempotent: an existing endpoint with a stored
 * secret is left alone; one without a usable secret is replaced.
 *
 * Runs even when STRIPE_WEBHOOK_SECRET is set: installs upgraded from 2.3
 * have that set for the old edge-function endpoint, and would otherwise
 * never get the new one (the webhook accepts either secret). An endpoint at
 * the new URL that you created yourself — with its secret in
 * STRIPE_WEBHOOK_SECRET — is left alone. Skipped when the site URL isn't a
 * public https origin (local dev uses `stripe listen`) or without a key.
 */
export async function ensureStripeWebhook(
  admin: SupabaseClient,
  siteUrl: string,
): Promise<ConnectResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { status: "skipped", reason: "no_stripe_key" };
  let origin: URL;
  try {
    origin = new URL(siteUrl);
  } catch {
    return { status: "skipped", reason: "not_public" };
  }
  if (
    origin.protocol !== "https:" ||
    ["localhost", "127.0.0.1"].includes(origin.hostname)
  ) {
    return { status: "skipped", reason: "not_public" };
  }

  try {
    const stripe = new Stripe(key);
    const url = `${origin.origin}${WEBHOOK_PATH}`;
    const { data: stored } = await admin.rpc("mod_billing_webhook_secret");
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const existing = endpoints.data.find((e) => e.url === url);

    // Ours (secret in Vault) or yours (secret in STRIPE_WEBHOOK_SECRET).
    if (existing && (stored || process.env.STRIPE_WEBHOOK_SECRET)) {
      return { status: "connected", url, created: false };
    }
    // An endpoint whose secret we don't hold can't be verified — replace it.
    if (existing) await stripe.webhookEndpoints.del(existing.id);

    const created = await stripe.webhookEndpoints.create({
      url,
      enabled_events: WEBHOOK_EVENTS,
      description: "Dream Starter Kit — billing (created automatically)",
    });
    if (!created.secret) {
      return { status: "error", message: "Stripe returned no signing secret" };
    }
    const { error } = await admin.rpc("mod_billing_set_webhook_secret", {
      _secret: created.secret,
    });
    if (error) throw new Error(error.message);
    resetWebhookSecretCache();
    await admin.rpc("audit_log_event", {
      _action: "billing.webhook_connected",
      _actor_type: "system",
      _entity_type: "stripe_webhook_endpoint",
      _entity_id: created.id,
    });
    return { status: "connected", url, created: true };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Endpoints left over from the two-webhook setup (for the upgrade notice). */
export async function legacyWebhookEndpoints(): Promise<
  { id: string; url: string }[]
> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return [];
  const stripe = new Stripe(key);
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  return endpoints.data
    .filter((e) => LEGACY_PATHS.some((p) => e.url.endsWith(p)))
    .map((e) => ({ id: e.id, url: e.url }));
}
