import type { Payload } from "payload";

import type { ModBillingSubscription as Subscription, User } from "@acme/cms";

import type { NormalizedSubscription } from "../server/core/types";

/**
 * Ledger → CMS `mod-billing-subscriptions`: the read-only admin copy of a
 * purchase (public.mod_billing_subscriptions stays the source of truth).
 * Provider-neutral: adapters call it after applying a subscription — and only
 * when it was the newest event, so the copy can't roll back. Upserts are
 * keyed by (provider, providerSubscriptionId).
 */
export interface CmsSubscriptionInput extends NormalizedSubscription {
  customerId?: string | null;
  /** The provider customer's email: a fallback to find the member. */
  customerEmail?: string | null;
  /** The provider deleted/ended the subscription (shown as "churned"). */
  deleted?: boolean;
  startedAt?: string | null;
  trialEndsAt?: string | null;
  currentPeriodStart?: string | null;
  canceledAt?: string | null;
}

const mapStatus = (
  s: NormalizedSubscription["status"],
  deleted: boolean,
): Subscription["status"] => {
  if (deleted) return "churned";
  switch (s) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "paused":
      return "paused";
    // past_due / unpaid / incomplete / incomplete_expired — payment trouble.
    default:
      return "past_due";
  }
};

async function findMember(
  payload: Payload,
  userId: string,
  email: string | null | undefined,
): Promise<Pick<User, "id"> | null> {
  const byId = await payload.find({
    collection: "users",
    where: { supabaseUserId: { equals: userId } },
    limit: 1,
    depth: 0,
    trash: true,
    overrideAccess: true,
  });
  if (byId.docs[0]) return byId.docs[0];
  if (!email) return null;
  const byEmail = await payload.find({
    collection: "users",
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    trash: true,
    overrideAccess: true,
  });
  return byEmail.docs[0] ?? null;
}

export async function projectSubscriptionToCms(
  payload: Payload,
  sub: CmsSubscriptionInput,
): Promise<void> {
  let user: Pick<User, "id"> | null = null;
  try {
    user = await findMember(payload, sub.userId, sub.customerEmail);
  } catch (err) {
    payload.logger.warn({ err }, "billing: member lookup failed");
  }

  const planId = sub.planId ? Number(sub.planId) || null : null;
  const isStripe = sub.provider === "stripe";
  const data = {
    user: user?.id ?? null,
    plan: planId,
    status: mapStatus(sub.status, sub.deleted ?? false),
    startedAt: sub.startedAt ?? null,
    trialEndsAt: sub.trialEndsAt ?? null,
    currentPeriodStart: sub.currentPeriodStart ?? null,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
    canceledAt: sub.canceledAt ?? null,
    provider: sub.provider,
    providerSubscriptionId: sub.id,
    providerCustomerId: sub.customerId ?? null,
    // Billing 1.x fields, still written for Stripe until a contract release.
    ...(isStripe
      ? {
          stripeSubscriptionID: sub.id,
          stripeCustomerID: sub.customerId ?? null,
        }
      : {}),
  };

  const existing = await payload.find({
    collection: "mod-billing-subscriptions",
    where: isStripe
      ? {
          or: [
            { providerSubscriptionId: { equals: sub.id } },
            { stripeSubscriptionID: { equals: sub.id } },
          ],
        }
      : {
          and: [
            { provider: { equals: sub.provider } },
            { providerSubscriptionId: { equals: sub.id } },
          ],
        },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.docs[0]) {
    await payload.update({
      collection: "mod-billing-subscriptions",
      id: existing.docs[0].id,
      data,
      depth: 0,
      overrideAccess: true,
    });
  } else {
    await payload.create({
      collection: "mod-billing-subscriptions",
      data,
      depth: 0,
      overrideAccess: true,
    });
  }
}
