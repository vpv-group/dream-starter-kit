import type { BasePayload } from "payload";
import Stripe from "stripe";

import type { ConnectorToken } from "@acme/mod-kit/server";
import { getAdapterSettings } from "@acme/mod-kit/payload";
import { getConnectorBroker } from "@acme/mod-kit/server";

import type { StripeAdapterSettings } from "../payload/settings";
import { settings as adapterSettings } from "../payload/settings";

/**
 * Where the Stripe credential comes from, in priority order:
 *
 * 1. "env" — STRIPE_SECRET_KEY (+ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY): your own
 *    keys. Always wins, so self-hosters, CI and `stripe listen` keep working.
 * 2. "meetdream" — "Connect with Stripe" (Modules → Billing): Stripe OAuth
 *    through the Meet Dream AI app. meetdream.com keeps the OAuth secret and
 *    refresh token and hands this site a short-lived credential for its own
 *    Stripe account (cached until 5 minutes before it expires).
 * 3. none — billing answers 503 "Billing not configured".
 */
export type StripeSource = "env" | "meetdream";

export interface StripeCredentials {
  source: StripeSource;
  secretKey: string;
  publishableKey: string | null;
  /** Act on behalf of this connected account (platform credentials). */
  stripeAccount: string | null;
  accountId: string | null;
  accountName: string | null;
  livemode: boolean | null;
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
  };
}

function fromToken(t: ConnectorToken): StripeCredentials {
  return {
    source: "meetdream",
    secretKey: t.accessToken,
    publishableKey: t.publishableKey ?? null,
    stripeAccount: t.onBehalfOf ?? null,
    accountId: t.accountId,
    accountName: t.accountName ?? null,
    livemode: t.livemode ?? null,
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
  const res = await broker.token("stripe");
  if (res.status === "ok") {
    return { status: "ok", credentials: fromToken(res.token) };
  }
  return { status: "none", message: res.message };
}

/** A Stripe client for credentials. */
export function stripeFor(c: StripeCredentials): Stripe {
  return new Stripe(
    c.secretKey,
    c.stripeAccount ? { stripeAccount: c.stripeAccount } : undefined,
  );
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
