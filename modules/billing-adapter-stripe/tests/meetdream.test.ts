/**
 * "Connect with Stripe" through Meet Dream (a Stripe Connect platform): the
 * site holds no Stripe credential — its Stripe client sends every call to
 * meetdream.com (`broker.forward`), the webhook target is registered with
 * Meet Dream (its per-site secret lands in Vault), and payments stay off
 * until Stripe onboarding is finished.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectorBroker, ConnectorStatus } from "@acme/mod-kit/server";
import {
  getConnectorBroker,
  registerConnectorBroker,
} from "@acme/mod-kit/server";

import { ensureStripeWebhook, WEBHOOK_PATH } from "../src/server/connect";
import {
  asStripeResponse,
  getPaymentsStripeOrNull,
  getStripeOrNull,
  stripeCredentials,
} from "../src/stripe/client";
import { fakeAdmin } from "./fakes";

const SITE = "https://app.example.com";

function broker(connection: ConnectorStatus | null) {
  const forwarded: {
    path: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }[] = [];
  const b: ConnectorBroker = {
    startConnect: () => Promise.resolve({ status: "ok", url: "https://x" }),
    status: () =>
      Promise.resolve(
        connection
          ? { status: "ok", connection }
          : { status: "not_connected", message: "Not connected" },
      ),
    forward: (_target, path, init) => {
      forwarded.push({ path, ...init, headers: init.headers ?? {} });
      return Promise.resolve(
        Response.json(
          { object: "list", data: [], has_more: false, url: "/v1/products" },
          { headers: { "request-id": "req_1" } },
        ),
      );
    },
    setWebhookTarget: () =>
      Promise.resolve({ status: "ok", secret: "whsec_meetdream_site" }),
    disconnect: () => Promise.resolve({ status: "ok" }),
  };
  registerConnectorBroker(b);
  return { forwarded };
}

const READY: ConnectorStatus = {
  accountId: "acct_site",
  accountName: "Acme",
  livemode: false,
  publishableKey: "pk_test_platform",
  ready: true,
};

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Connect with Stripe through Meet Dream", () => {
  it("exposes the connected account for Stripe.js and no Stripe secret", async () => {
    broker(READY);
    const res = await stripeCredentials();
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.credentials).toMatchObject({
      source: "meetdream",
      secretKey: null,
      publishableKey: "pk_test_platform",
      stripeAccount: "acct_site",
      ready: true,
    });
  });

  it("sends Stripe calls to Meet Dream with their path, without a Stripe key", async () => {
    const { forwarded } = broker(READY);
    const stripe = await getStripeOrNull();
    expect(stripe).not.toBeNull();
    const list = await stripe?.products.list({ limit: 1 });
    expect(list?.data).toEqual([]);
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]?.path).toBe("/v1/products?limit=1");
    expect(forwarded[0]?.method).toBe("GET");
    // The placeholder key goes out as Authorization, which the host broker
    // strips (connectors-core.ts); Meet Dream uses the platform key.
    expect(JSON.stringify(forwarded[0]?.headers)).not.toContain("sk_live");
  });

  it("turns Meet Dream's own error answers into Stripe errors", async () => {
    // stripe-node reads a body without `error` as success: a `not_connected`
    // or an outage answer must fail the call instead of returning nothing.
    broker(READY);
    const current = getConnectorBroker();
    if (!current) throw new Error("no broker");
    registerConnectorBroker({
      ...current,
      forward: () =>
        Promise.resolve(
          Response.json(
            { code: "not_allowed", message: "That Stripe call isn't allowed" },
            { status: 403 },
          ),
        ),
    });
    const stripe = await getStripeOrNull();
    await expect(
      stripe?.customers.create({ email: "a@b.c" }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "not_allowed",
      message: "Meet Dream: That Stripe call isn't allowed",
    });
  });

  it("passes Stripe's own errors through unchanged", async () => {
    const res = await asStripeResponse(
      Response.json(
        {
          error: {
            type: "card_error",
            code: "card_declined",
            message: "Declined",
          },
        },
        { status: 402 },
      ),
    );
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: { type: "card_error", code: "card_declined", message: "Declined" },
    });
  });

  it("keeps payments off while Stripe onboarding isn't finished", async () => {
    broker({
      ...READY,
      ready: false,
      onboardingUrl: "https://connect.stripe.com/x",
    });
    expect(await getStripeOrNull()).not.toBeNull(); // catalog sync still works
    expect(await getPaymentsStripeOrNull()).toBeNull();
  });

  it("registers the webhook with Meet Dream and stores its per-site secret", async () => {
    broker(READY);
    const fake = fakeAdmin();
    const result = await ensureStripeWebhook(fake.admin, SITE);
    expect(result).toEqual({
      status: "connected",
      url: `${SITE}${WEBHOOK_PATH}`,
      created: true,
      legacyDisabled: [],
    });
    expect(fake.rpcCalls).toContainEqual({
      fn: "mod_billing_adapter_stripe_set_webhook_secret",
      args: { _secret: "whsec_meetdream_site" },
    });
  });

  it("registers a localhost site with Meet Dream outside production (local stand-in)", async () => {
    broker(READY);
    const fake = fakeAdmin();
    const result = await ensureStripeWebhook(
      fake.admin,
      "http://localhost:3000",
    );
    expect(result).toMatchObject({
      status: "connected",
      url: `http://localhost:3000${WEBHOOK_PATH}`,
    });
  });

  it("still skips a localhost site in production", async () => {
    broker(READY);
    vi.stubEnv("NODE_ENV", "production");
    try {
      const result = await ensureStripeWebhook(
        fakeAdmin().admin,
        "http://localhost:3000",
      );
      expect(result).toEqual({ status: "skipped", reason: "not_public" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("leaves Vault alone when the stored secret already matches", async () => {
    broker(READY);
    const fake = fakeAdmin({
      rpc: {
        mod_billing_adapter_stripe_webhook_secret: {
          data: "whsec_meetdream_site",
          error: null,
        },
      },
    });
    const result = await ensureStripeWebhook(fake.admin, SITE);
    expect(result).toMatchObject({ status: "connected", created: false });
    expect(
      fake.rpcCalls.some(
        (c) => c.fn === "mod_billing_adapter_stripe_set_webhook_secret",
      ),
    ).toBe(false);
  });
});
