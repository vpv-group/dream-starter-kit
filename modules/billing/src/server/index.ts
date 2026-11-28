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

import type {
  AdminClient,
  BillingServiceContext,
  BillingSubject,
  NormalizedSubscription,
} from "./core/types";
import { resolvePremiumPlan } from "../paywall-copy";
import { createAdminClient } from "./admin-client";
import { entitlementFor } from "./core/entitlement";
import { expireGrants } from "./core/grants";
import { applySubscription } from "./core/ledger";
import {
  getBillingProvider,
  getBillingProviders,
  invoicesFor,
  resolveWebProvider,
} from "./core/providers";
import { billingTagSettings } from "./core/settings";
import { siteUrl } from "./core/site";
import {
  syncAllBillingTags,
  syncBillingTags,
  syncSubjectTags,
} from "./core/tags";
import { hasBillingRecord, moveBillingRows } from "./core/users";
import { staffRoutes } from "./staff";

/* -------------------------------------------------------------------------- */
/* The core API for payment-provider adapters (`adapter.for: "billing"`).     */
/* Adapters write billing state ONLY through these.                           */
/* -------------------------------------------------------------------------- */

export * from "./core/types";
export {
  applySubscription,
  claimWebhookEvent,
  findCustomerSubject,
  findCustomerUser,
  findOrgCustomer,
  findSubjectCustomer,
  findUserCustomer,
  finishWebhookEvent,
  linkCustomer,
  linkOrgCustomer,
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
  syncSubjectTags,
  TAG_DEFAULTS,
} from "./core/tags";
export {
  expireGrants,
  grantPlan,
  GRANT_PROVIDER,
  revokeGrant,
  workspaceOwnerId,
} from "./core/grants";
export type { BillingTagSettings, DesiredTag, TagInput } from "./core/tags";
export { entitlementFor } from "./core/entitlement";
export type { ViewerEntitlement } from "./core/entitlement";
export {
  getBillingProvider,
  getBillingProviders,
  invoicesFor,
  resolveWebProvider,
} from "./core/providers";
export { billingTagSettings } from "./core/settings";
export { siteUrl } from "./core/site";
export { createAdminClient } from "./admin-client";
export { projectSubscriptionToCms } from "../payload/project";
/** Remote MCP tools (manifest `server.mcp`): billing_* plan + coupon tools. */
export { mcp } from "./mcp";
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
    // A workspace purchase tags every member; a personal one, the buyer.
    await syncSubjectTags(
      admin,
      sub.orgId ? { orgId: sub.orgId } : { userId: sub.userId },
      tagSettings,
    ).catch((err: unknown) => {
      console.warn("[billing] tag sync failed", err);
    });
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
  /** Buy for this workspace (the caller must be one of its owners/admins). */
  orgId: z.uuid().optional(),
});

/**
 * Whether the caller administers the workspace (owner/admin) — billing for a
 * workspace is theirs to buy and manage. Asked as the caller (RLS/RPC).
 */
export async function isWorkspaceAdmin(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_org_admin", { _org: orgId });
  return !error && data === true;
}

/** The subject a signed-in request is about: the caller, or a workspace they administer. */
async function requestSubject(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string | null | undefined,
): Promise<BillingSubject | null> {
  if (!orgId) return { userId };
  return (await isWorkspaceAdmin(supabase, orgId)) ? { orgId } : null;
}

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
    const orgId = parsed.data.orgId ?? null;
    if (orgId) {
      if (!ctx.user) {
        return json(401, { error: "Sign in to buy for a workspace" });
      }
      if (!(await isWorkspaceAdmin(ctx.supabase, orgId))) {
        return json(403, {
          error: "Only workspace owners and admins can buy for it",
        });
      }
    }
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
        orgId,
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
    const admin = createAdminClient();
    const settings = await billingTagSettings(ctx.getPayload);
    // Staff grants whose end date passed stop counting (the view already
    // ignores them); mark them canceled, then re-derive every tag.
    const expired = await expireGrants(admin).catch((err: unknown) => {
      console.warn("[billing] expiring grants failed", err);
      return [];
    });
    const synced = await syncAllBillingTags(admin, settings);
    return Response.json({ synced, expiredGrants: expired.length });
  },

  // Billing 1.x paths (Stripe), forwarded to the Stripe adapter.
  "POST /stripe/webhook": forwardLegacy("stripe", "POST /stripe/webhook"),
  "GET /cron/connect": forwardLegacy("stripe", "GET /cron/connect"),
};

/** Authed: self-serve management and receipts, across providers. */
export const routes: ModRouteTable = {
  /**
   * The customer portal of the provider the subject pays through. Body
   * `{ orgId? }`: a workspace's portal (owners/admins only).
   */
  "POST /portal": async (req, ctx) => {
    const body = (await req.json().catch(() => ({}))) as { orgId?: string };
    const subject = await requestSubject(ctx.supabase, ctx.user.id, body.orgId);
    if (!subject) return json(403, { error: "Not a workspace admin" });
    const admin = createAdminClient();
    const { data: links } =
      subject.orgId !== undefined
        ? await admin
            .from("mod_billing_org_customer_links")
            .select("provider")
            .eq("org_id", subject.orgId)
        : await admin
            .from("mod_billing_customer_links")
            .select("provider")
            .eq("user_id", subject.userId);
    const providers = await getBillingProviders();
    // The subject's own providers first, then any web provider (legacy rows).
    const mine = new Set((links ?? []).map((l) => l.provider));
    const ordered = [
      ...providers.filter((p) => mine.has(p.id)),
      ...providers.filter((p) => !mine.has(p.id)),
    ];
    for (const p of ordered) {
      if (!p.createPortalSession) continue;
      try {
        const session = await p.createPortalSession({
          subject,
          origin: siteUrl(),
        });
        if (session) return Response.json({ url: session.url, provider: p.id });
      } catch (err) {
        return errorResponse(err, "Could not open billing management");
      }
    }
    return json(404, { error: "No billing account" });
  },

  /** Past invoices from every provider, newest first (`?org=` for a workspace). */
  "GET /invoices": async (req, ctx) => {
    const org = new URL(req.url).searchParams.get("org");
    const subject = await requestSubject(ctx.supabase, ctx.user.id, org);
    if (!subject) return json(403, { error: "Not a workspace admin" });
    return Response.json({ invoices: await invoicesFor(subject) });
  },

  ...staffRoutes,
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

  /**
   * The plan a premium page's paywall offers, resolved server-side so the
   * `premium-content` slot opens with pricing and no client fetch. Null when
   * no plan is set up yet (the gate degrades gracefully).
   */
  getPremiumPlan: async (ctx: BillingServiceContext) => {
    try {
      const payload = await ctx.getPayload();
      const { docs } = await payload.find({
        collection: "mod-billing-plans",
        where: { active: { equals: true } },
        sort: "displayOrder",
        limit: 50,
        depth: 0,
      });
      return resolvePremiumPlan(docs);
    } catch {
      return null;
    }
  },
};

export type BillingServices = typeof services;
