import "server-only";

import type {
  ModPublicRouteContext,
  ModPublicRouteHandler,
  ModPublicRouteTable,
} from "@acme/mod-kit/server";
import {
  createAdminClient,
  projectSubscriptionToCms,
} from "@acme/mod-billing/server";

/**
 * The webhook and the hourly connect check, shared by the adapter's own
 * paths and the billing 1.x paths billing still forwards for one release
 * (/api/mod/billing/stripe/webhook, /api/mod/billing/cron/connect).
 */

/** The ONE Stripe webhook (signature-verified; Stripe has no session). */
export const webhookRoute: ModPublicRouteHandler = async (
  req: Request,
  ctx: ModPublicRouteContext,
) => {
  const { handleStripeWebhook } = await import("./webhook");
  return handleStripeWebhook(req, {
    getPayload: ctx.getPayload,
    projectSubscription: async (sub) => {
      await projectSubscriptionToCms(await ctx.getPayload(), sub);
    },
  });
};

/**
 * Hourly (Supabase Cron → kit_register_app_schedule): make sure the Stripe
 * webhook endpoint exists at the adapter's path and its secret is in Vault.
 * No-op once connected.
 */
export const cronConnectRoute: ModPublicRouteHandler = async (req) => {
  const { isCronRequest } = await import("@acme/mod-kit/cron");
  if (!isCronRequest(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { ensureStripeWebhook } = await import("./connect");
  const result = await ensureStripeWebhook(
    createAdminClient(),
    webhookSiteUrl(),
  );
  return Response.json(result);
};

/**
 * The stable public origin the webhook endpoint is registered at — never a
 * per-deploy preview URL (NEXT_PUBLIC_VERCEL_URL), which would move the
 * endpoint on every preview.
 */
export function webhookSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL ?? ""))
  );
}

/** Billing 1.x keys → handlers (see BillingProvider.legacyRoutes). */
export const legacyRoutes: ModPublicRouteTable = {
  "POST /stripe/webhook": webhookRoute,
  "GET /cron/connect": cronConnectRoute,
};
