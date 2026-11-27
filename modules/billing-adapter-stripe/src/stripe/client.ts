import type { BasePayload } from "payload";
import Stripe from "stripe";

import type { ConnectorStatus } from "@acme/mod-kit/server";
import { getAdapterSettings } from "@acme/mod-kit/payload";
import { getConnectorBroker } from "@acme/mod-kit/server";

import type { StripeAdapterSettings } from "../payload/settings";
import { settings as adapterSettings } from "../payload/settings";

/**
 * Where the Stripe credential comes from, in priority order:
 *
 * 1. "env" — STRIPE_SECRET_KEY (+ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY): your own
 *    keys. Always wins, so self-hosters, CI and `stripe listen` keep working.
 * 2. "meetdream" — "Connect with Stripe" (Modules → Billing): Meet Dream is a
 *    Stripe Connect platform (Stripe's recommended model) and this site's
 *    business is one of its connected accounts. The site holds NO Stripe
 *    credential: every API call goes to meetdream.com (`broker.forward`),
 *    which makes it with the platform key and `Stripe-Account` set to this
 *    site's own account — direct charges, so payments land in that account.
 * 3. none — billing answers 503 "Billing not configured".
 */
export type StripeSource = "env" | "meetdream";

export interface StripeCredentials {
  source: StripeSource;
  /** Env keys only; the Meet Dream source holds no Stripe secret. */
  secretKey: string | null;
  publishableKey: string | null;
  /**
   * The connected account Stripe.js acts on (direct charges load Stripe.js
   * with the platform's publishable key + `{ stripeAccount }`).
   */
  stripeAccount: string | null;
  accountId: string | null;
  accountName: string | null;
  livemode: boolean | null;
  /** Meet Dream: the account can take payments (onboarding finished). */
  ready: boolean;
  /** Meet Dream: where the owner finishes Stripe onboarding. */
  onboardingUrl: string | null;
}

export type CredentialsResult =
  | { status: "ok"; credentials: StripeCredentials }
  | { status: "none"; message: string };

function fromEnv(): StripeCredentials | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return {
    source: "env",
    secretKey: key,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
    stripeAccount: null,
    accountId: null,
    accountName: null,
    livemode: key.startsWith("sk_live_") || key.startsWith("rk_live_"),
    ready: true,
    onboardingUrl: null,
  };
}

function fromConnection(c: ConnectorStatus): StripeCredentials {
  return {
    source: "meetdream",
    secretKey: null,
    publishableKey: c.publishableKey ?? null,
    stripeAccount: c.accountId,
    accountId: c.accountId,
    accountName: c.accountName ?? null,
    livemode: c.livemode ?? null,
    ready: c.ready ?? true,
    onboardingUrl: c.onboardingUrl ?? null,
  };
}

/** The credential to use right now (see the priority above). */
export async function stripeCredentials(): Promise<CredentialsResult> {
  const env = fromEnv();
  if (env) return { status: "ok", credentials: env };
  const broker = getConnectorBroker();
  if (!broker) {
    return {
      status: "none",
      message:
        "Stripe isn't connected (set STRIPE_SECRET_KEY or Connect with Stripe).",
    };
  }
  const res = await broker.status("stripe");
  if (res.status === "ok") {
    return { status: "ok", credentials: fromConnection(res.connection) };
  }
  return { status: "none", message: res.message };
}

/**
 * Stand-in key for the Meet Dream source: stripe-node requires one, but
 * `forward` drops the Authorization header and meetdream.com uses the
 * platform key.
 */
const FORWARDED_KEY = "sk_meetdream_forwarded";

/**
 * stripe-node's fetch transport, pointed at meetdream.com: each request keeps
 * its Stripe path, method, headers (idempotency key, API version) and body,
 * and Stripe's response comes back unchanged — so the rest of the adapter
 * uses the normal Stripe client.
 */
function forwardingFetch(): typeof fetch {
  const forward = async (input: RequestInfo | URL, init?: RequestInit) => {
    const broker = getConnectorBroker();
    if (!broker) throw new StripeNotConfiguredError();
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    return broker.forward("stripe", `${url.pathname}${url.search}`, {
      method: init?.method ?? "GET",
      headers,
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
  };
  return forward;
}

/** A Stripe client for credentials. */
export function stripeFor(c: StripeCredentials): Stripe {
  if (c.source === "meetdream") {
    return new Stripe(FORWARDED_KEY, {
      httpClient: Stripe.createFetchHttpClient(forwardingFetch()),
    });
  }
  return new Stripe(c.secretKey ?? "", undefined);
}

/** Thrown when there's no credential (routes answer 503). */
export class StripeNotConfiguredError extends Error {
  readonly status = 503;
  constructor(message = "Billing not configured") {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}

/** A Stripe client, or null when Stripe isn't connected. */
export async function getStripeOrNull(): Promise<Stripe | null> {
  const res = await stripeCredentials();
  return res.status === "ok" ? stripeFor(res.credentials) : null;
}

/**
 * A Stripe client for taking payments (checkout, express intents): null
 * while a Meet Dream account is still in Stripe onboarding, so buyers see
 * "payments aren't set up yet" instead of a Stripe error. Catalog sync and
 * reads use getStripeOrNull, which works during onboarding.
 */
export async function getPaymentsStripeOrNull(): Promise<Stripe | null> {
  const res = await stripeCredentials();
  return res.status === "ok" && res.credentials.ready
    ? stripeFor(res.credentials)
    : null;
}

/** A Stripe client; throws StripeNotConfiguredError when not connected. */
export async function getStripe(): Promise<Stripe> {
  const stripe = await getStripeOrNull();
  if (!stripe) throw new StripeNotConfiguredError();
  return stripe;
}

/**
 * The Stripe tab's settings (Modules → Billing → Stripe), defaults when the
 * CMS is unreachable. Pass `payload` from a hook/route when you have it — and
 * `req` from inside a Payload hook (same transaction, no extra connection).
 */
export async function stripeSettings(
  payload?: BasePayload,
  req?: unknown,
): Promise<StripeAdapterSettings> {
  try {
    const p =
      payload ??
      (await (async () => {
        const [{ getPayload }, { default: config }] = await Promise.all([
          import("payload"),
          import("@payload-config"),
        ]);
        return getPayload({ config });
      })());
    return await getAdapterSettings<StripeAdapterSettings>(p, adapterSettings, {
      req,
    });
  } catch {
    return adapterSettings.defaults as StripeAdapterSettings;
  }
}
