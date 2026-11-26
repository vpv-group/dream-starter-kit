import "server-only";

import type { SupabaseClient as BaseSupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import type { Database } from "@acme/api";

import { resetWebhookSecretCache } from "./webhook";

type SupabaseClient = BaseSupabaseClient<Database>;

/** The Stripe calls this file makes (a fake one in tests). */
export type StripeEndpointsClient = Pick<Stripe, "webhookEndpoints">;

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

/**
 * Events are rendered in the API version the installed Stripe SDK speaks (its
 * types and the webhook's parsing match it), not the account's default, so a
 * dashboard-side version upgrade can't change the payloads under the code.
 */
export const WEBHOOK_API_VERSION = Stripe.API_VERSION;

/** Endpoints from before the single-webhook consolidation. */
export const LEGACY_PATHS = [
  "/functions/v1/billing-stripe-webhook",
  "/cms-api/stripe/webhooks",
];

export interface LegacyEndpoint {
  id: string;
  url: string;
}

export type ConnectResult =
  | { status: "skipped"; reason: "no_stripe_key" | "not_public" }
  | {
      status: "connected";
      url: string;
      created: boolean;
      /** Legacy endpoints this run disabled (see disableLegacyEndpoints). */
      legacyDisabled: LegacyEndpoint[];
    }
  | { status: "error"; message: string };

/**
 * Register the ONE Stripe webhook endpoint through the Stripe API, so a
 * founder only pastes STRIPE_SECRET_KEY — no dashboard step, no second
 * secret. The endpoint's signing secret is returned by Stripe only at
 * creation; it is stored in Supabase Vault (mod_billing_set_webhook_secret)
 * and read by the webhook. Idempotent: an existing endpoint with a stored
 * secret is left alone; one without a usable secret is replaced. New
 * endpoints are pinned to the SDK's API version (WEBHOOK_API_VERSION).
 *
 * Runs even when STRIPE_WEBHOOK_SECRET is set: installs upgraded from 2.4 or earlier
 * have that set for the old edge-function endpoint, and would otherwise
 * never get the new one (the webhook accepts either secret). An endpoint at
 * the new URL that you created yourself — with its secret in
 * STRIPE_WEBHOOK_SECRET — is left alone. Skipped when the site URL isn't a
 * public https origin (local dev uses `stripe listen`) or without a key.
 *
 * Once the endpoint at the new URL is enabled, the pre-2.5 endpoints of THIS
 * install are disabled (see disableLegacyEndpoints), so an upgraded install
 * stops receiving every event twice.
 */
export async function ensureStripeWebhook(
  admin: SupabaseClient,
  siteUrl: string,
  deps: { stripe?: StripeEndpointsClient } = {},
): Promise<ConnectResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key && !deps.stripe)
    return { status: "skipped", reason: "no_stripe_key" };
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
    const stripe: StripeEndpointsClient = deps.stripe ?? new Stripe(key ?? "");
    const url = `${origin.origin}${WEBHOOK_PATH}`;
    const { data: stored } = await admin.rpc("mod_billing_webhook_secret");
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const existing = endpoints.data.find((e) => e.url === url);

    // Ours (secret in Vault) or yours (secret in STRIPE_WEBHOOK_SECRET).
    if (existing && (stored || process.env.STRIPE_WEBHOOK_SECRET)) {
      // A disabled one is yours to re-enable; until then the old endpoints
      // keep delivering.
      const legacyDisabled =
        existing.status === "enabled"
          ? await disableLegacyEndpoints(admin, stripe, endpoints.data, origin)
          : [];
      return { status: "connected", url, created: false, legacyDisabled };
    }
    // An endpoint whose secret we don't hold can't be verified — replace it.
    if (existing) await stripe.webhookEndpoints.del(existing.id);

    const created = await stripe.webhookEndpoints.create({
      url,
      enabled_events: WEBHOOK_EVENTS,
      api_version: WEBHOOK_API_VERSION,
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
    const legacyDisabled = await disableLegacyEndpoints(
      admin,
      stripe,
      endpoints.data,
      origin,
    );
    return { status: "connected", url, created: true, legacyDisabled };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Hosts whose legacy endpoints belong to this install: the site and its
 *  Supabase project (the old edge function). */
function ownHosts(origin: URL): Set<string> {
  const hosts = new Set([origin.host.toLowerCase()]);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      hosts.add(new URL(supabaseUrl).host.toLowerCase());
    } catch {
      /* not a URL — only the site host counts */
    }
  }
  return hosts;
}

/** Whether an endpoint URL is one of this install's pre-2.5 endpoints. */
export function isOwnLegacyEndpoint(
  endpointUrl: string,
  hosts: Set<string>,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    return false;
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  return (
    hosts.has(parsed.host.toLowerCase()) &&
    LEGACY_PATHS.some((p) => path.endsWith(p))
  );
}

/**
 * Disable (never delete) this install's ENABLED pre-2.5 endpoints — the old
 * edge function (on the project's Supabase host) and the old Payload plugin
 * endpoint (on the site host) — so an upgraded install, whose old edge
 * function may still be deployed, stops processing every event twice.
 * Endpoints on other hosts (another app on the same Stripe account) are left
 * alone. Each one disabled is audited and logged; a failure on one is logged
 * and doesn't fail the connect run (it's retried next hour).
 */
async function disableLegacyEndpoints(
  admin: SupabaseClient,
  stripe: StripeEndpointsClient,
  endpoints: Stripe.WebhookEndpoint[],
  origin: URL,
): Promise<LegacyEndpoint[]> {
  const hosts = ownHosts(origin);
  const disabled: LegacyEndpoint[] = [];
  for (const e of endpoints) {
    if (e.status !== "enabled" || !isOwnLegacyEndpoint(e.url, hosts)) continue;
    try {
      await stripe.webhookEndpoints.update(e.id, { disabled: true });
    } catch (err) {
      console.error(
        `[billing] could not disable legacy Stripe webhook ${e.id} (${e.url})`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    disabled.push({ id: e.id, url: e.url });
    console.info(
      `[billing] disabled legacy Stripe webhook ${e.id} (${e.url}); delete it in Stripe once the new endpoint shows successful deliveries`,
    );
    const { error } = await admin.rpc("audit_log_event", {
      _action: "billing.legacy_webhook_disabled",
      _actor_type: "system",
      _entity_type: "stripe_webhook_endpoint",
      _entity_id: e.id,
      _meta: { url: e.url },
    });
    if (error) {
      console.error("[billing] audit of legacy webhook failed", error.message);
    }
  }
  return disabled;
}

/** Endpoints left over from the two-webhook setup (for the upgrade notice). */
export async function legacyWebhookEndpoints(): Promise<
  (LegacyEndpoint & { status: string })[]
> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return [];
  const stripe = new Stripe(key);
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  return endpoints.data
    .filter((e) => LEGACY_PATHS.some((p) => e.url.endsWith(p)))
    .map((e) => ({ id: e.id, url: e.url, status: e.status }));
}
