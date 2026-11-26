/**
 * ensureStripeWebhook against a fake Stripe webhookEndpoints API: the new
 * endpoint is pinned to the SDK's API version, and this install's ENABLED
 * pre-2.5 endpoints are disabled (never deleted, audited) once the new one is
 * enabled — endpoints on other hosts are left alone.
 */
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StripeEndpointsClient } from "../src/server/stripe/connect";
import {
  ensureStripeWebhook,
  isOwnLegacyEndpoint,
  WEBHOOK_API_VERSION,
  WEBHOOK_PATH,
} from "../src/server/stripe/connect";
import { fakeAdmin } from "./fakes";

const SITE = "https://app.example.com";
const SUPABASE = "https://abcd.supabase.co";
const NEW_URL = `${SITE}${WEBHOOK_PATH}`;

interface Endpoint {
  id: string;
  url: string;
  status: "enabled" | "disabled";
}

function fakeStripe(endpoints: Endpoint[], failUpdate: string[] = []) {
  const updates: [string, unknown][] = [];
  const created: unknown[] = [];
  const deleted: string[] = [];
  const client = {
    webhookEndpoints: {
      list: () => Promise.resolve({ data: endpoints }),
      update: (id: string, params: unknown) => {
        if (failUpdate.includes(id)) {
          return Promise.reject(new Error("stripe unavailable"));
        }
        updates.push([id, params]);
        return Promise.resolve({ id });
      },
      create: (params: unknown) => {
        created.push(params);
        return Promise.resolve({ id: "we_new", secret: "whsec_new" });
      },
      del: (id: string) => {
        deleted.push(id);
        return Promise.resolve({ id, deleted: true });
      },
    },
  };
  return {
    stripe: client as unknown as StripeEndpointsClient,
    updates,
    created,
    deleted,
  };
}

const legacy: Endpoint[] = [
  // This install's old edge function (its Supabase host) …
  {
    id: "we_edge",
    url: `${SUPABASE}/functions/v1/billing-stripe-webhook`,
    status: "enabled",
  },
  // … and its old Payload plugin endpoint (the site host).
  { id: "we_cms", url: `${SITE}/cms-api/stripe/webhooks`, status: "enabled" },
  // Another app on the same Stripe account.
  {
    id: "we_other",
    url: "https://other.example.org/cms-api/stripe/webhooks",
    status: "enabled",
  },
  // Already disabled.
  {
    id: "we_old_disabled",
    url: `${SUPABASE}/functions/v1/billing-stripe-webhook/`,
    status: "disabled",
  },
];

const savedEnv = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

const auditCalls = (fake: ReturnType<typeof fakeAdmin>) =>
  fake.rpcCalls.filter((c) => c.fn === "audit_log_event").map((c) => c.args);

describe("ensureStripeWebhook", () => {
  it("creates the endpoint pinned to the SDK API version, then disables this install's legacy endpoints", async () => {
    const fake = fakeAdmin();
    const s = fakeStripe(legacy);
    const result = await ensureStripeWebhook(fake.admin, SITE, {
      stripe: s.stripe,
    });

    expect(result).toEqual({
      status: "connected",
      url: NEW_URL,
      created: true,
      legacyDisabled: [
        { id: "we_edge", url: legacy[0]?.url },
        { id: "we_cms", url: legacy[1]?.url },
      ],
    });
    expect(WEBHOOK_API_VERSION).toBe(Stripe.API_VERSION);
    expect(s.created[0]).toMatchObject({
      url: NEW_URL,
      api_version: Stripe.API_VERSION,
    });
    expect(fake.rpcCalls).toContainEqual({
      fn: "mod_billing_set_webhook_secret",
      args: { _secret: "whsec_new" },
    });
    // Disabled, never deleted; other hosts and disabled ones untouched.
    expect(s.updates).toEqual([
      ["we_edge", { disabled: true }],
      ["we_cms", { disabled: true }],
    ]);
    expect(s.deleted).toEqual([]);
    expect(auditCalls(fake)).toEqual([
      expect.objectContaining({ _action: "billing.webhook_connected" }),
      expect.objectContaining({
        _action: "billing.legacy_webhook_disabled",
        _entity_id: "we_edge",
        _meta: { url: legacy[0]?.url },
      }),
      expect.objectContaining({
        _action: "billing.legacy_webhook_disabled",
        _entity_id: "we_cms",
      }),
    ]);
  });

  it("disables legacy endpoints on later runs once the new endpoint is enabled", async () => {
    const fake = fakeAdmin({
      rpc: { mod_billing_webhook_secret: { data: "whsec_vault", error: null } },
    });
    const s = fakeStripe([
      { id: "we_new", url: NEW_URL, status: "enabled" },
      ...legacy,
    ]);
    const result = await ensureStripeWebhook(fake.admin, SITE, {
      stripe: s.stripe,
    });
    expect(result).toMatchObject({ status: "connected", created: false });
    expect(s.created).toEqual([]);
    expect(s.updates.map(([id]) => id)).toEqual(["we_edge", "we_cms"]);
  });

  it("leaves legacy endpoints enabled while the new endpoint is disabled", async () => {
    const fake = fakeAdmin({
      rpc: { mod_billing_webhook_secret: { data: "whsec_vault", error: null } },
    });
    const s = fakeStripe([
      { id: "we_new", url: NEW_URL, status: "disabled" },
      ...legacy,
    ]);
    const result = await ensureStripeWebhook(fake.admin, SITE, {
      stripe: s.stripe,
    });
    expect(result).toMatchObject({ status: "connected", legacyDisabled: [] });
    expect(s.updates).toEqual([]);
  });

  it("keeps going when one legacy endpoint can't be disabled", async () => {
    const fake = fakeAdmin({
      rpc: { mod_billing_webhook_secret: { data: "whsec_vault", error: null } },
    });
    const s = fakeStripe(
      [{ id: "we_new", url: NEW_URL, status: "enabled" }, ...legacy],
      ["we_edge"],
    );
    const result = await ensureStripeWebhook(fake.admin, SITE, {
      stripe: s.stripe,
    });
    expect(result).toMatchObject({
      status: "connected",
      legacyDisabled: [{ id: "we_cms" }],
    });
  });

  it("skips non-public sites", async () => {
    const s = fakeStripe(legacy);
    expect(
      await ensureStripeWebhook(fakeAdmin().admin, "http://localhost:3000", {
        stripe: s.stripe,
      }),
    ).toEqual({ status: "skipped", reason: "not_public" });
    expect(s.updates).toEqual([]);
  });
});

describe("isOwnLegacyEndpoint", () => {
  const hosts = new Set(["app.example.com", "abcd.supabase.co"]);
  it("matches legacy paths on this install's hosts only", () => {
    expect(
      isOwnLegacyEndpoint(
        "https://abcd.supabase.co/functions/v1/billing-stripe-webhook",
        hosts,
      ),
    ).toBe(true);
    expect(
      isOwnLegacyEndpoint(
        "https://APP.example.com/cms-api/stripe/webhooks/",
        hosts,
      ),
    ).toBe(true);
    expect(
      isOwnLegacyEndpoint(
        "https://evil.example.com/cms-api/stripe/webhooks",
        hosts,
      ),
    ).toBe(false);
    expect(isOwnLegacyEndpoint(`${SITE}${WEBHOOK_PATH}`, hosts)).toBe(false);
    expect(isOwnLegacyEndpoint("not a url", hosts)).toBe(false);
  });
});
