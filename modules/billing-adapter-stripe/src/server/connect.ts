import "server-only";

import Stripe from "stripe";

import type { AdminClient as SupabaseClient } from "@acme/mod-billing/server";
import { getConnectorBroker } from "@acme/mod-kit/server";

import { stripeCredentials, stripeFor } from "../stripe/client";
import { resetWebhookSecretCache } from "./webhook";

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
    "payment_intent.succeeded",
  ];

export const WEBHOOK_PATH = "/api/mod/billing-adapter-stripe/webhook";

/**
 * Events are rendered in the API version the installed Stripe SDK speaks (its
 * types and the webhook's parsing match it), not the account's default, so a
 * dashboard-side version upgrade can't change the payloads under the code.
 */
export const WEBHOOK_API_VERSION = Stripe.API_VERSION;

/**
 * This install's earlier endpoints: the pre-2.5 two-webhook setup, and billing
 * 1.x's single webhook (before Stripe moved into this adapter).
 */
export const LEGACY_PATHS = [
  "/functions/v1/billing-stripe-webhook",
  "/cms-api/stripe/webhooks",
  "/api/mod/billing/stripe/webhook",
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
 * founder only connects Stripe (or pastes STRIPE_SECRET_KEY) — no dashboard
 * step, no second secret. The endpoint's signing secret is returned by Stripe
 * only at creation; it is stored in Supabase Vault
 * (mod_billing_adapter_stripe_set_webhook_secret) and read by the webhook. Idempotent: an existing endpoint with a stored
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
 * Once the endpoint at the new URL is enabled, the earlier endpoints of THIS
 * install (pre-2.5, and billing 1.x's /api/mod/billing/stripe/webhook) are
 * disabled (see disableLegacyEndpoints), so an upgraded install stops
 * receiving every event twice.
 */
export async function ensureStripeWebhook(
  admin: SupabaseClient,
  siteUrl: string,
  deps: {
    stripe?: StripeEndpointsClient;
    /** Meet Dream's webhook-target call (tests inject it). */
    meetDreamTarget?: (url: string) => Promise<WebhookTargetResult>;
  } = {},
): Promise<ConnectResult> {
  const creds = deps.stripe ? null : await stripeCredentials();
  const viaMeetDream =
    !!deps.meetDreamTarget ||
    (creds?.status === "ok" && creds.credentials.source === "meetdream");
  const client = viaMeetDream
    ? null
    : (deps.stripe ??
      (creds?.status === "ok" ? stripeFor(creds.credentials) : null));
  if (!viaMeetDream && !client) {
    return { status: "skipped", reason: "no_stripe_key" };
  }
  let origin: URL;
  try {
    origin = new URL(siteUrl);
  } catch {
    return { status: "skipped", reason: "not_public" };
  }
  const local = isLocalHost(origin.hostname);
  // Stripe only delivers to public https endpoints. Through Meet Dream, a
  // local site may still register outside production: meetdream.com refuses
  // a non-public target itself, and a local stand-in (the E2E's fake
  // meetdream.com) delivers to localhost. A production build pointed at a
  // local stand-in (the kit's release E2E, `next build && next start`) may
  // too: a real deployment never has a localhost DREAM_REGISTRY_URL.
  const devMeetDream =
    viaMeetDream &&
    local &&
    (process.env.NODE_ENV !== "production" || localMeetDream());
  if (!devMeetDream && (origin.protocol !== "https:" || local)) {
    return { status: "skipped", reason: "not_public" };
  }

  if (viaMeetDream) {
    return registerWithMeetDream(
      admin,
      `${origin.origin}${WEBHOOK_PATH}`,
      deps.meetDreamTarget ?? meetDreamWebhookTarget,
    );
  }
  if (!client) return { status: "skipped", reason: "no_stripe_key" };

  try {
    const stripe: StripeEndpointsClient = client;
    const url = `${origin.origin}${WEBHOOK_PATH}`;
    const { data: stored } = await admin.rpc(
      "mod_billing_adapter_stripe_webhook_secret",
    );
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const existing = endpoints.data.find((e) => e.url === url);

    // Ours (secret in Vault) or yours (secret in STRIPE_WEBHOOK_SECRET).
    if (existing && (stored || process.env.STRIPE_WEBHOOK_SECRET)) {
      // One we created gets any event a newer adapter handles (e.g.
      // payment_intent.succeeded, 1.2). Yours (STRIPE_WEBHOOK_SECRET) is left
      // as you set it.
      const ours =
        (existing.metadata as Record<string, string> | null | undefined)
          ?.created_by === "billing-adapter-stripe";
      const has = new Set<string>(existing.enabled_events);
      const missing = WEBHOOK_EVENTS.filter(
        (e) => !has.has(e) && !has.has("*"),
      );
      if (ours && missing.length > 0) {
        await stripe.webhookEndpoints.update(existing.id, {
          enabled_events: [
            ...(existing.enabled_events as Stripe.WebhookEndpointUpdateParams.EnabledEvent[]),
            ...missing,
          ],
        });
      }
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
      metadata: { created_by: "billing-adapter-stripe" },
    });
    if (!created.secret) {
      return { status: "error", message: "Stripe returned no signing secret" };
    }
    const { error } = await admin.rpc(
      "mod_billing_adapter_stripe_set_webhook_secret",
      { _secret: created.secret },
    );
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

type WebhookTargetResult =
  | { status: "ok"; secret: string }
  | { status: "no_key" | "not_connected" | "error"; message: string };

const isLocalHost = (hostname: string) =>
  ["localhost", "127.0.0.1"].includes(hostname);

/** Is this site's Meet Dream a local stand-in (DREAM_REGISTRY_URL)? */
function localMeetDream(): boolean {
  try {
    const url = process.env.DREAM_REGISTRY_URL;
    return !!url && isLocalHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function meetDreamWebhookTarget(
  url: string,
): Promise<WebhookTargetResult> {
  const broker = getConnectorBroker();
  if (!broker) {
    return { status: "error", message: "No Meet Dream connector broker" };
  }
  return broker.setWebhookTarget("stripe", url);
}

/**
 * Connected through Meet Dream (a Stripe Connect platform): Stripe sends the
 * connected account's events to Meet Dream's platform endpoint, which
 * delivers them here signed with a per-site secret in Stripe's own
 * `Stripe-Signature` format — so the webhook route verifies them exactly as
 * it verifies Stripe's. This registers the URL and stores that secret in
 * Vault (the same slot the self-registered endpoint uses). Idempotent.
 */
async function registerWithMeetDream(
  admin: SupabaseClient,
  url: string,
  target: (url: string) => Promise<WebhookTargetResult>,
): Promise<ConnectResult> {
  try {
    const res = await target(url);
    if (res.status !== "ok") return { status: "error", message: res.message };
    const { data: stored } = await admin.rpc(
      "mod_billing_adapter_stripe_webhook_secret",
    );
    const created = stored !== res.secret;
    if (created) {
      const { error } = await admin.rpc(
        "mod_billing_adapter_stripe_set_webhook_secret",
        { _secret: res.secret },
      );
      if (error) throw new Error(error.message);
      resetWebhookSecretCache();
      await admin.rpc("audit_log_event", {
        _action: "billing.webhook_connected",
        _actor_type: "system",
        _entity_type: "meetdream_webhook_target",
        _entity_id: url,
      });
    }
    return { status: "connected", url, created, legacyDisabled: [] };
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
        `[stripe] could not disable legacy Stripe webhook ${e.id} (${e.url})`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    disabled.push({ id: e.id, url: e.url });
    console.info(
      `[stripe] disabled legacy Stripe webhook ${e.id} (${e.url}); delete it in Stripe once the new endpoint shows successful deliveries`,
    );
    const { error } = await admin.rpc("audit_log_event", {
      _action: "billing.legacy_webhook_disabled",
      _actor_type: "system",
      _entity_type: "stripe_webhook_endpoint",
      _entity_id: e.id,
      _meta: { url: e.url },
    });
    if (error) {
      console.error("[stripe] audit of legacy webhook failed", error.message);
    }
  }
  return disabled;
}
