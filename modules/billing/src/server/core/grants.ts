import type { AdminClient, BillingSubject } from "./types";
import { applySubscription, upsertPrice, upsertProduct } from "./ledger";

/**
 * Staff grants ("comp" plans): a no-charge entitlement staff give a person or
 * a workspace from the billing support view. Stored in the ledger like any
 * purchase — provider "manual", store "promotional", who granted it and why —
 * so entitlements, tags and the CMS read them with no special case. A grant
 * may end on a date (the entitlements view stops counting it then, and the
 * daily run marks it canceled). Paid subscriptions are never touched here.
 */

export const GRANT_PROVIDER = "manual";

export interface GrantInput {
  subject: BillingSubject;
  /** The Payload plan it stands for (its name becomes the plan tag). */
  plan: { id: string | number; name: string; entitlement?: string | null };
  /** ISO time it ends; null = until revoked. */
  expiresAt: string | null;
  note?: string | null;
  /** The staff member granting it. */
  grantedBy: string;
  /** Update an existing grant (extend / change) instead of adding one. */
  grantId?: string;
}

/** A workspace's owner (purchases are filed under a user; for a workspace
 *  that nobody in particular bought, it's the owner). */
export async function workspaceOwnerId(
  admin: AdminClient,
  orgId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workspace not found");
  return data.owner_id;
}

/**
 * The catalog row a grant points at, so tags and /billing show the plan's
 * name. No interval: a grant has no billing cycle.
 */
async function grantPrice(
  admin: AdminClient,
  plan: GrantInput["plan"],
): Promise<string> {
  const productId = `manual:plan:${String(plan.id)}`;
  const priceId = `manual:price:${String(plan.id)}`;
  await upsertProduct(admin, {
    provider: GRANT_PROVIDER,
    id: productId,
    active: true,
    name: plan.name,
  });
  await upsertPrice(admin, {
    provider: GRANT_PROVIDER,
    id: priceId,
    productId,
    active: true,
    unitAmount: 0,
    currency: "usd",
    type: "one_time",
    interval: null,
    intervalCount: null,
  });
  return priceId;
}

/** Add (or update) a grant. Returns its id. */
export async function grantPlan(
  admin: AdminClient,
  input: GrantInput,
): Promise<string> {
  const id = input.grantId ?? `manual:${crypto.randomUUID()}`;
  if (input.grantId && !input.grantId.startsWith("manual:")) {
    throw new Error("Only staff grants can be changed here");
  }
  const userId =
    input.subject.orgId !== undefined
      ? await workspaceOwnerId(admin, input.subject.orgId)
      : input.subject.userId;
  await applySubscription(
    admin,
    {
      provider: GRANT_PROVIDER,
      id,
      userId,
      orgId: input.subject.orgId ?? null,
      priceId: await grantPrice(admin, input.plan),
      status: "active",
      quantity: 1,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: input.expiresAt,
      kind: "subscription",
      planId: String(input.plan.id),
      entitlement: input.plan.entitlement === "members" ? "members" : "premium",
      store: "promotional",
      grantedBy: input.grantedBy,
      note: input.note ?? null,
    },
    null,
  );
  return id;
}

/** End a grant now. Only staff grants; paid purchases are the provider's. */
export async function revokeGrant(
  admin: AdminClient,
  grantId: string,
): Promise<{ userId: string; orgId: string | null } | null> {
  if (!grantId.startsWith("manual:")) {
    throw new Error("Only staff grants can be revoked here");
  }
  const { data, error } = await admin
    .from("mod_billing_subscriptions")
    .update({
      status: "canceled",
      current_period_end: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", grantId)
    .eq("provider", GRANT_PROVIDER)
    .select("user_id, org_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { userId: data.user_id, orgId: data.org_id } : null;
}

/**
 * Mark grants whose end date passed as canceled (the daily run). Returns the
 * subjects whose tags need a refresh.
 */
export async function expireGrants(
  admin: AdminClient,
): Promise<{ userId: string; orgId: string | null }[]> {
  const { data, error } = await admin
    .from("mod_billing_subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("provider", GRANT_PROVIDER)
    .in("status", ["active", "trialing"])
    .lt("current_period_end", new Date().toISOString())
    .select("user_id, org_id");
  if (error) throw new Error(error.message);
  return data.map((r) => ({ userId: r.user_id, orgId: r.org_id }));
}
