import "server-only";

import type { BasePayload } from "payload";
import { z } from "zod/v4";

import type {
  ModPublicRouteTable,
  ModRouteContext,
  ModRouteTable,
} from "@acme/mod-kit/server";
import { createAdminClient, siteUrl } from "@acme/mod-billing/server";
import { getConnectorBroker, withRateLimit } from "@acme/mod-kit/server";

import {
  getStripeOrNull,
  stripeCredentials,
  stripeSettings,
} from "../stripe/client";
import { cronConnectRoute, webhookRoute, webhookSiteUrl } from "./legacy";
import { purchaseRoutes } from "./routes";

/**
 * billing-adapter-stripe's server entry:
 * - `adapter` — the BillingProvider billing calls out to (./provider.ts);
 * - `publicRoutes` — the webhook, the hourly connect check, the client config
 *   and the embedded purchase flow, at /api/mod/billing-adapter-stripe/*;
 * - `routes` — the admin connector panel's actions (admins only).
 */
export { adapter } from "./provider";

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

export const publicRoutes: ModPublicRouteTable = {
  // Stripe sends bursts from a few shared IPs; every event is signature-
  // verified before any work, so the shared per-IP budget doesn't apply.
  "POST /webhook": withRateLimit(webhookRoute, false),
  "GET /cron/connect": cronConnectRoute,

  /**
   * What the browser needs to mount Stripe Elements — the publishable key of
   * whichever account is connected (env or "Connect with Stripe"), served at
   * runtime so connecting needs no rebuild. Public values only.
   */
  "GET /config": async (_req, ctx) => {
    const settings = await stripeSettings(await ctx.getPayload());
    const creds = await stripeCredentials();
    const c = creds.status === "ok" ? creds.credentials : null;
    return Response.json(
      {
        enabled: settings.enabled && c?.ready === true,
        publishableKey: c?.publishableKey ?? null,
        stripeAccount: c?.stripeAccount ?? null,
        checkoutExperience: settings.hostedCheckout ? "hosted" : "embedded",
        expressWallets: settings.expressWallets,
      },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  },

  ...purchaseRoutes,
};

/* ----------------------------- admin connector ---------------------------- */

/** Admins only (the CMS `admin` role, like the rest of Modules). */
async function isAdmin(ctx: ModRouteContext): Promise<boolean> {
  const payload = await ctx.getPayload();
  const { docs } = await payload.find({
    collection: "users",
    where: { supabaseUserId: { equals: ctx.user.id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const roles = (docs[0] as { roles?: string[] } | undefined)?.roles ?? [];
  return roles.includes("admin");
}

function adminOnly(
  handler: (req: Request, ctx: ModRouteContext) => Promise<Response>,
) {
  return async (req: Request, ctx: ModRouteContext) =>
    (await isAdmin(ctx))
      ? handler(req, ctx)
      : json(403, { error: "Admins only" });
}

async function countSync(payload: BasePayload, collection: string) {
  const count = async (status: string) =>
    (
      await payload.count({
        collection: collection as "mod-billing-plans",
        where: { syncStatus: { equals: status } },
        overrideAccess: true,
      })
    ).totalDocs;
  const [synced, error, unsynced] = await Promise.all([
    count("synced"),
    count("error"),
    count("unsynced"),
  ]);
  return { synced, error, unsynced };
}

const connectSchema = z.object({
  mode: z.enum(["test", "live"]).optional(),
  /** Where to come back to — an /admin path on this site. */
  returnTo: z.string().regex(/^\/admin(\/[\w\-/]*)?(\?[\w=&-]*)?$/),
});

export const routes: ModRouteTable = {
  /** Everything the connector panel shows. */
  "GET /admin/status": adminOnly(async (_req, ctx) => {
    const payload = await ctx.getPayload();
    const settings = await stripeSettings(payload);
    const creds = await stripeCredentials();
    const c = creds.status === "ok" ? creds.credentials : null;
    const expectedUrl = (() => {
      try {
        const origin = new URL(webhookSiteUrl()).origin;
        return `${origin}/api/mod/billing-adapter-stripe/webhook`;
      } catch {
        return null;
      }
    })();

    const admin = createAdminClient();
    const [{ data: secret }, { data: last }] = await Promise.all([
      admin.rpc("mod_billing_adapter_stripe_webhook_secret"),
      admin
        .from("mod_billing_webhook_events")
        .select("type, received_at")
        .eq("provider", "stripe")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    let endpoint: { url: string; status: string } | null = null;
    let apiError: string | null = null;
    // Through Meet Dream, Stripe delivers to Meet Dream's platform endpoint,
    // which forwards here: the stored per-site secret is the registration.
    const stripe =
      c && c.source !== "meetdream" ? await getStripeOrNull() : null;
    if (c?.source === "meetdream" && expectedUrl && secret) {
      endpoint = { url: expectedUrl, status: "enabled" };
    }
    if (stripe && expectedUrl) {
      try {
        const list = await stripe.webhookEndpoints.list({ limit: 100 });
        const found = list.data.find((e) => e.url === expectedUrl);
        endpoint = found ? { url: found.url, status: found.status } : null;
      } catch (err) {
        apiError = err instanceof Error ? err.message : String(err);
      }
    }

    return Response.json({
      enabled: settings.enabled,
      connection: c
        ? {
            source: c.source,
            accountId: c.accountId,
            accountName: c.accountName,
            livemode: c.livemode,
            publishableKey: Boolean(c.publishableKey),
            ready: c.ready,
            onboardingUrl: c.onboardingUrl,
          }
        : {
            source: "none",
            message: creds.status === "none" ? creds.message : null,
          },
      envKeys: Boolean(process.env.STRIPE_SECRET_KEY),
      canConnect: getConnectorBroker() !== null,
      webhook: {
        expectedUrl,
        endpoint,
        secretStored: Boolean(secret),
        envSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
        lastEvent: last
          ? { type: last.type, receivedAt: last.received_at }
          : null,
      },
      catalog: {
        plans: await countSync(payload, "mod-billing-plans"),
        coupons: await countSync(payload, "mod-billing-coupons"),
      },
      apiError,
    });
  }),

  /**
   * Start "Connect with Stripe": Meet Dream creates (or reuses) this site's
   * connected account and returns Stripe-hosted onboarding.
   */
  "POST /admin/connect": adminOnly(async (req) => {
    const parsed = connectSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json(400, { error: "Invalid return path" });
    const broker = getConnectorBroker();
    if (!broker)
      return json(503, {
        error: "Meet Dream connections aren't available on this site.",
      });
    const res = await broker.startConnect(
      "stripe",
      `${siteUrl()}${parsed.data.returnTo}`,
      parsed.data.mode ? { mode: parsed.data.mode } : undefined,
    );
    return res.status === "ok"
      ? Response.json({ url: res.url })
      : json(502, { error: res.message, status: res.status });
  }),

  /** Revoke the Meet Dream connection (own env keys are unaffected). */
  "POST /admin/disconnect": adminOnly(async () => {
    const broker = getConnectorBroker();
    if (!broker) return json(503, { error: "Not available" });
    const res = await broker.disconnect("stripe");
    return res.status === "ok"
      ? Response.json({ ok: true })
      : json(502, { error: res.message });
  }),

  /** One cheap authenticated Stripe call with the current credential. */
  "POST /admin/test": adminOnly(async () => {
    const stripe = await getStripeOrNull();
    if (!stripe)
      return json(409, { ok: false, error: "Stripe isn't connected." });
    try {
      await stripe.products.list({ limit: 1 });
      return Response.json({ ok: true });
    } catch (err) {
      return json(502, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }),

  /** Register (or repair) the webhook endpoint now instead of next hour. */
  "POST /admin/webhook": adminOnly(async () => {
    const { ensureStripeWebhook } = await import("./connect");
    return Response.json(
      await ensureStripeWebhook(createAdminClient(), webhookSiteUrl()),
    );
  }),

  /**
   * Re-push every plan and coupon to Stripe (e.g. after connecting), then
   * retire what deleted plans/coupons left behind (a delete has no
   * `syncStatus`, so a failed Stripe cleanup is retried here).
   */
  "POST /admin/resync": adminOnly(async (_req, ctx) => {
    const payload = await ctx.getPayload();
    const resynced = { plans: 0, coupons: 0 };
    for (const [collection, key] of [
      ["mod-billing-plans", "plans"],
      ["mod-billing-coupons", "coupons"],
    ] as const) {
      const { docs } = await payload.find({
        collection,
        limit: 200,
        depth: 0,
        overrideAccess: true,
        where: { skipSync: { not_equals: true } },
      });
      for (const doc of docs) {
        // An empty update re-runs billing's afterChange catalog sync.
        await payload.update({
          collection,
          id: doc.id,
          data: {},
          overrideAccess: true,
        });
        resynced[key] += 1;
      }
    }
    let retired = { plans: 0, coupons: 0 };
    let retireError: string | null = null;
    try {
      const { retireOrphans } = await import("./catalog");
      retired = await retireOrphans(payload);
    } catch (err) {
      retireError = err instanceof Error ? err.message : String(err);
      payload.logger.error({ err }, "stripe: retiring deleted catalog failed");
    }
    return Response.json({ ok: true, ...resynced, retired, retireError });
  }),
};
