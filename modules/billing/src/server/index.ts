import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { BasePayload } from "payload";
import { z } from "zod/v4";

import type { Database } from "@acme/api";
import type {
  ModPublicRouteContext,
  ModPublicRouteTable,
  ModRouteTable,
} from "@acme/mod-kit/server";
import { getModuleSettings } from "@acme/mod-kit/payload";

import type { BillingSettings } from "../payload/settings";
import type { BillingTagSettings } from "./core/tags";
import type {
  AdminClient,
  BillingInvoice,
  BillingServiceContext,
  NormalizedSubscription,
} from "./core/types";
import { settings as billingSettings } from "../payload/settings";
import { createAdminClient } from "./admin-client";
import { entitlementFor } from "./core/entitlement";
import { applySubscription } from "./core/ledger";
import {
  getBillingProvider,
  getBillingProviders,
  resolveWebProvider,
} from "./core/providers";
import { siteUrl } from "./core/site";
import { syncAllBillingTags, syncBillingTags } from "./core/tags";
import { hasBillingRecord, moveBillingRows } from "./core/users";

/* -------------------------------------------------------------------------- */
/* The core API for payment-provider adapters (`adapter.for: "billing"`).     */
/* Adapters write billing state ONLY through these.                           */
/* -------------------------------------------------------------------------- */

export * from "./core/types";
export {
  applySubscription,
  claimWebhookEvent,
  findCustomerUser,
  findUserCustomer,
  finishWebhookEvent,
  linkCustomer,
  setBillingEmail,
  subscriptionRow,
  upsertPrice,
  upsertProduct,
} from "./core/ledger";
export {
  accountEmailOf,
  convertOrMergeAnon,
  findUserIdByEmail,
  hasBillingRecord,
  moveBillingRows,
  resolveOrInviteGuest,
} from "./core/users";
export {
  desiredBillingTags,
  syncAllBillingTags,
  syncBillingTags,
  TAG_DEFAULTS,
} from "./core/tags";
export type { BillingTagSettings, DesiredTag, TagInput } from "./core/tags";
export { entitlementFor } from "./core/entitlement";
export type { ViewerEntitlement } from "./core/entitlement";
export {
  getBillingProvider,
  getBillingProviders,
  resolveWebProvider,
} from "./core/providers";
export { siteUrl } from "./core/site";
export { createAdminClient } from "./admin-client";
export { projectSubscriptionToCms } from "../payload/project";
export type { CmsSubscriptionInput } from "../payload/project";

/** A failure an adapter wants answered with a specific status + message. */
export class BillingError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

/** Billing settings → Tags tab (defaults when the CMS is unreachable). */
export async function billingTagSettings(
  getPayload: () => Promise<BasePayload>,
): Promise<BillingTagSettings | null> {
  try {
    const s = await getModuleSettings<BillingSettings>(
      await getPayload(),
      billingSettings,
    );
    return s.tags ?? null;
  } catch {
    return null;
  }
}

/**
 * Apply a purchase (see `applySubscription`) and, when it was applied,
 * re-sync the buyer's billing tags. What an adapter's webhook calls.
 */
export async function recordSubscription(
  admin: AdminClient,
  sub: NormalizedSubscription,
  eventAt: Date | null,
  opts: { getPayload?: () => Promise<BasePayload> } = {},
): Promise<boolean> {
  const applied = await applySubscription(admin, sub, eventAt);
  if (applied) {
    const tagSettings = opts.getPayload
      ? await billingTagSettings(opts.getPayload)
      : null;
    await syncBillingTags(admin, sub.userId, tagSettings).catch(
      (err: unknown) => {
        console.warn("[billing] tag sync failed", err);
      },
    );
  }
  return applied;
}

/* -------------------------------------------------------------------------- */
/* Routes — /api/mod/billing/*                                                */
/* -------------------------------------------------------------------------- */

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

const errorResponse = (err: unknown, fallback: string) => {
  if (err instanceof BillingError)
    return json(err.status, { error: err.message });
  console.error(`[billing] ${fallback}`, err);
  return json(500, { error: fallback });
};

const checkoutSchema = z.object({
  planId: z.union([z.string(), z.number()]),
  /** A specific provider; default: the first configured web provider. */
  provider: z.string().min(1).optional(),
});

/**
 * Routes billing 1.x served for Stripe (its webhook endpoint and hourly
 * connect check), forwarded to the provider that now owns them until the
 * provider has moved its endpoint (one release). `-- dream:contract` later.
 */
function forwardLegacy(provider: string, key: string) {
  return async (req: Request, ctx: ModPublicRouteContext) => {
    const p = await getBillingProvider(provider);
    const handler = p?.legacyRoutes?.[key];
    if (!handler) return json(404, { error: "Not found" });
    return handler(req, ctx);
  };
}

/**
 * Public: checkout supports GUEST buyers (pay first; the provider's webhook
 * matches the email to an account or invites one). Cron routes check their
 * caller themselves.
 */
export const publicRoutes: ModPublicRouteTable = {
  /** Hosted checkout for a Payload plan, by the web payment provider. */
  "POST /checkout": async (req, ctx) => {
    const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json(400, { error: "Invalid plan" });
    const provider = await resolveWebProvider(parsed.data.provider);
    if (!provider?.createCheckout) {
      return json(503, { error: "Billing not configured" });
    }
    const payload = await ctx.getPayload();
    const plan = await payload
      .findByID({
        collection: "mod-billing-plans",
        id: parsed.data.planId,
        depth: 0,
      })
      .catch(() => null);
    if (!plan?.active) {
      return json(409, {
        error: "This plan isn't available for purchase yet.",
      });
    }
    try {
      const { url } = await provider.createCheckout({
        plan,
        user: ctx.user,
        origin: siteUrl(),
      });
      return Response.json({ url, provider: provider.id });
    } catch (err) {
      return errorResponse(err, "Could not start checkout");
    }
  },

  /**
   * Daily (Supabase Cron): re-derive billing tags for changes no webhook
   * announces — a trial or paid period lapsing, cancel-at-period-end landing.
   */
  "GET /cron/tags": async (req, ctx) => {
    const { isCronRequest } = await import("@acme/mod-kit/cron");
    if (!isCronRequest(req)) return json(401, { error: "Unauthorized" });
    const synced = await syncAllBillingTags(
      createAdminClient(),
      await billingTagSettings(ctx.getPayload),
    );
    return Response.json({ synced });
  },

  // Billing 1.x paths (Stripe), forwarded to the Stripe adapter.
  "POST /stripe/webhook": forwardLegacy("stripe", "POST /stripe/webhook"),
  "GET /cron/connect": forwardLegacy("stripe", "GET /cron/connect"),
};

/** Authed: self-serve management and receipts, across providers. */
export const routes: ModRouteTable = {
  /** The customer portal of the provider the user pays through. */
  "POST /portal": async (_req, ctx) => {
    const admin = createAdminClient();
    const { data: links } = await admin
      .from("mod_billing_customer_links")
      .select("provider")
      .eq("user_id", ctx.user.id);
    const providers = await getBillingProviders();
    // The user's own providers first, then any web provider (legacy rows).
    const mine = new Set((links ?? []).map((l) => l.provider));
    const ordered = [
      ...providers.filter((p) => mine.has(p.id)),
      ...providers.filter((p) => !mine.has(p.id)),
    ];
    for (const p of ordered) {
      if (!p.createPortalSession) continue;
      try {
        const session = await p.createPortalSession({
          userId: ctx.user.id,
          origin: siteUrl(),
        });
        if (session) return Response.json({ url: session.url, provider: p.id });
      } catch (err) {
        return errorResponse(err, "Could not open billing management");
      }
    }
    return json(404, { error: "No billing account" });
  },

  /** Past invoices from every provider, newest first. */
  "GET /invoices": async (_req, ctx) => {
    const providers = await getBillingProviders();
    const lists = await Promise.all(
      providers.map(async (p) => {
        if (!p.listInvoices) return [];
        try {
          return await p.listInvoices({ userId: ctx.user.id });
        } catch (err) {
          console.warn(`[billing] ${p.id} invoices failed`, err);
          return [];
        }
      }),
    );
    const invoices: BillingInvoice[] = lists
      .flat()
      .sort((a, b) => b.created - a.created);
    return Response.json({ invoices });
  },
};

/* -------------------------------------------------------------------------- */
/* Services — what the HOST calls (generated modServices.billing).            */
/* -------------------------------------------------------------------------- */

export const services = {
  /** The viewer's entitlement from their own (RLS) session. Fails closed. */
  getViewerEntitlement: (
    supabase: SupabaseClient<Database>,
    user?: User | null,
  ) => entitlementFor(supabase, user),

  /**
   * Before an account is deleted: every provider cancels what the user still
   * pays for (billing rows then cascade with the profile).
   */
  onAccountDelete: async ({ userId }: { userId: string }) => {
    for (const p of await getBillingProviders()) {
      if (!p.onAccountDelete) continue;
      try {
        await p.onAccountDelete({ userId });
      } catch (err) {
        console.error(`[billing] ${p.id} account-delete cleanup failed`, err);
      }
    }
  },

  /**
   * An anonymous user is being merged into a permanent account: move their
   * purchases first (they cascade with the anon user), then re-tag.
   */
  onUserMerge: async (
    ctx: BillingServiceContext,
    { fromId, toId }: { fromId: string; toId: string },
  ) => {
    const admin = createAdminClient();
    await moveBillingRows(admin, fromId, toId);
    await syncBillingTags(
      admin,
      toId,
      await billingTagSettings(ctx.getPayload),
    ).catch((err: unknown) => {
      console.warn("[billing] tag sync after merge failed", err);
    });
  },

  /** A new account (any entry path): give it its billing tags ("Free"). */
  onUserCreated: async (
    ctx: BillingServiceContext,
    { userId }: { userId: string },
  ) => {
    await syncBillingTags(
      createAdminClient(),
      userId,
      await billingTagSettings(ctx.getPayload),
    );
  },

  /** Whether the user ever bought anything (any provider). */
  hasBillingRecord: ({ userId }: { userId: string }) =>
    hasBillingRecord(createAdminClient(), userId),
};

export type BillingServices = typeof services;
