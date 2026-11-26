import type { Payload } from "payload";
import type Stripe from "stripe";

import type { ModBillingSubscription as Subscription, User } from "@acme/cms";

import { createAdminClient } from "../server/admin-client";

/**
 * Stripe → CMS `subscriptions` projection: the read-only admin copy of
 * public.mod_billing_subscriptions (the source of truth). Called by the ONE
 * Stripe webhook (POST /api/mod/billing/stripe/webhook,
 * src/server/stripe/webhook.ts) after it applied a customer.subscription.*
 * event — and only when that event was the newest, so the projection can't
 * roll back. Upserts are keyed by the Stripe subscription id. The user is resolved
 * customer id → public.customers (service-role read; allowed server-side per
 * golden rule #2) → cms users by supabaseUserId, with a customer-email
 * fallback for guest checkouts mirrored before the account existed.
 */

const toIso = (seconds: number | null | undefined): string | null =>
  seconds == null ? null : new Date(seconds * 1000).toISOString();

const mapStatus = (
  s: Stripe.Subscription.Status,
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

export async function syncSubscriptionFromStripe({
  event,
  payload,
  stripe,
}: {
  event:
    | Stripe.CustomerSubscriptionCreatedEvent
    | Stripe.CustomerSubscriptionUpdatedEvent
    | Stripe.CustomerSubscriptionDeletedEvent;
  payload: Payload;
  stripe: Stripe;
}): Promise<void> {
  const sub = event.data.object;
  const deleted = event.type === "customer.subscription.deleted";
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Resolve the member: Stripe customer → public.customers → cms users.
  let user: Pick<User, "id"> | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("mod_billing_customers")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.user_id) {
      const { docs } = await payload.find({
        collection: "users",
        where: { supabaseUserId: { equals: data.user_id } },
        limit: 1,
        depth: 0,
        trash: true,
        overrideAccess: true,
      });
      user = docs[0] ?? null;
    }
  } catch (err) {
    payload.logger.warn({ err }, "stripe-webhook: customers lookup failed");
  }
  if (!user) {
    // Fallback: match by the Stripe customer's email.
    try {
      const customer = await stripe.customers.retrieve(customerId);
      const email = !customer.deleted ? customer.email : null;
      if (email) {
        const { docs } = await payload.find({
          collection: "users",
          where: { email: { equals: email } },
          limit: 1,
          depth: 0,
          trash: true,
          overrideAccess: true,
        });
        user = docs[0] ?? null;
      }
    } catch (err) {
      payload.logger.warn(
        { err },
        "stripe-webhook: customer email fallback failed",
      );
    }
  }

  // Resolve the plan by the price the subscription is on.
  const item = sub.items.data[0];
  const priceId = item?.price.id;
  let planId: Subscription["plan"] = null;
  if (priceId) {
    const { docs } = await payload.find({
      collection: "mod-billing-plans",
      where: { stripePriceId: { equals: priceId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    planId = docs[0]?.id ?? null;
  }

  const data = {
    user: user?.id ?? null,
    plan: planId,
    status: mapStatus(sub.status, deleted),
    startedAt: toIso(sub.start_date),
    trialEndsAt: toIso(sub.trial_end),
    // stripe v22 (API 2025+): the billing period lives on the item.
    currentPeriodStart: toIso(item?.current_period_start),
    currentPeriodEnd: toIso(item?.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: toIso(sub.canceled_at),
    stripeSubscriptionID: sub.id,
    stripeCustomerID: customerId,
  };

  const existing = await payload.find({
    collection: "mod-billing-subscriptions",
    where: { stripeSubscriptionID: { equals: sub.id } },
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
