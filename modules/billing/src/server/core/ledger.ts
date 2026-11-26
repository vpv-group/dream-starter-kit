import type { Json } from "@acme/api";

import type {
  AdminClient,
  BillingSubject,
  CatalogPrice,
  CatalogProduct,
  ClaimResult,
  NormalizedSubscription,
} from "./types";

/**
 * The purchase ledger — the ONLY way adapters write billing state. Every
 * function takes the service-role client (webhooks have no session) and is
 * provider-neutral: rows carry `provider`, so Stripe, an app store and any
 * later provider share one set of tables that RLS clients read.
 */

/* --------------------------------- events -------------------------------- */

/**
 * Claim a provider event BEFORE running any side effect, so a redelivery —
 * even one arriving while the first is still running — is applied once
 * (mod_billing_claim_event). 'busy' → answer non-2xx so the provider retries.
 */
export async function claimWebhookEvent(
  admin: AdminClient,
  provider: string,
  id: string,
  type: string,
): Promise<ClaimResult> {
  const { data, error } = await admin.rpc("mod_billing_claim_event", {
    _provider: provider,
    _id: id,
    _type: type,
  });
  if (error) throw new Error(error.message);
  if (data === "claimed" || data === "duplicate" || data === "busy") {
    return data;
  }
  throw new Error(`unexpected claim result: ${String(data)}`);
}

/** Mark a claimed event done (`ok`) or release it for the provider's retry. */
export async function finishWebhookEvent(
  admin: AdminClient,
  provider: string,
  id: string,
  ok: boolean,
): Promise<void> {
  const { error } = await admin.rpc("mod_billing_finish_event", {
    _provider: provider,
    _id: id,
    _ok: ok,
  });
  if (error) {
    // Applied events are still acknowledged; a stuck claim is taken over
    // after five minutes if the provider redelivers.
    console.error(
      `[billing] could not ${ok ? "complete" : "release"} ${provider} event ${id}:`,
      error.message,
    );
  }
}

/* ------------------------------- customers ------------------------------- */

/**
 * Link a user to their customer id at a provider (one per user + provider).
 * Stripe's link is also written to the legacy mod_billing_customers table so
 * the previous release keeps working during a rollout (dropped in a later
 * contract release).
 */
export async function linkCustomer(
  admin: AdminClient,
  link: { userId: string; provider: string; customerId: string },
): Promise<void> {
  // A customer id belongs to one user: a re-link (e.g. an anonymous buyer
  // merged into their real account) moves it.
  await admin
    .from("mod_billing_customer_links")
    .delete()
    .eq("provider", link.provider)
    .eq("provider_customer_id", link.customerId)
    .neq("user_id", link.userId);
  const { error } = await admin.from("mod_billing_customer_links").upsert(
    {
      user_id: link.userId,
      provider: link.provider,
      provider_customer_id: link.customerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(error.message);
  if (link.provider === "stripe") {
    // stripe_customer_id is unique there too: free it first.
    await admin
      .from("mod_billing_customers")
      .delete()
      .eq("stripe_customer_id", link.customerId)
      .neq("user_id", link.userId);
    await admin
      .from("mod_billing_customers")
      .upsert(
        { user_id: link.userId, stripe_customer_id: link.customerId },
        { onConflict: "user_id" },
      );
  }
}

/** The user linked to a provider customer id, if any. */
export async function findCustomerUser(
  admin: AdminClient,
  provider: string,
  customerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("mod_billing_customer_links")
    .select("user_id")
    .eq("provider", provider)
    .eq("provider_customer_id", customerId)
    .maybeSingle();
  if (data?.user_id) return data.user_id;
  if (provider !== "stripe") return null;
  // Rows written by billing 1.x before the links table existed.
  const { data: legacy } = await admin
    .from("mod_billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return legacy?.user_id ?? null;
}

/** The user's customer id at a provider, if any. */
export async function findUserCustomer(
  admin: AdminClient,
  userId: string,
  provider: string,
): Promise<string | null> {
  const { data } = await admin
    .from("mod_billing_customer_links")
    .select("provider_customer_id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (data?.provider_customer_id) return data.provider_customer_id;
  if (provider !== "stripe") return null;
  const { data: legacy } = await admin
    .from("mod_billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  return legacy?.stripe_customer_id ?? null;
}

/* --------------------------- workspace customers -------------------------- */

/** Link a workspace to its customer id at a provider (one per provider). */
export async function linkOrgCustomer(
  admin: AdminClient,
  link: { orgId: string; provider: string; customerId: string },
): Promise<void> {
  await admin
    .from("mod_billing_org_customer_links")
    .delete()
    .eq("provider", link.provider)
    .eq("provider_customer_id", link.customerId)
    .neq("org_id", link.orgId);
  const { error } = await admin.from("mod_billing_org_customer_links").upsert(
    {
      org_id: link.orgId,
      provider: link.provider,
      provider_customer_id: link.customerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider" },
  );
  if (error) throw new Error(error.message);
}

/** A workspace's customer id at a provider, if any. */
export async function findOrgCustomer(
  admin: AdminClient,
  orgId: string,
  provider: string,
): Promise<string | null> {
  const { data } = await admin
    .from("mod_billing_org_customer_links")
    .select("provider_customer_id")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();
  return data?.provider_customer_id ?? null;
}

/** Whose customer this is: a workspace's, a person's, or nobody's yet. */
export async function findCustomerSubject(
  admin: AdminClient,
  provider: string,
  customerId: string,
): Promise<BillingSubject | null> {
  const { data } = await admin
    .from("mod_billing_org_customer_links")
    .select("org_id")
    .eq("provider", provider)
    .eq("provider_customer_id", customerId)
    .maybeSingle();
  if (data?.org_id) return { orgId: data.org_id };
  const userId = await findCustomerUser(admin, provider, customerId);
  return userId ? { userId } : null;
}

/** The subject's customer id at a provider (person or workspace). */
export async function findSubjectCustomer(
  admin: AdminClient,
  subject: BillingSubject,
  provider: string,
): Promise<string | null> {
  return subject.orgId !== undefined
    ? findOrgCustomer(admin, subject.orgId, provider)
    : findUserCustomer(admin, subject.userId, provider);
}

/** Keep (or clear, with null) a billing email that differs from the login. */
export async function setBillingEmail(
  admin: AdminClient,
  userId: string,
  provider: string,
  billingEmail: string | null,
): Promise<void> {
  const { error } = await admin
    .from("mod_billing_customer_links")
    .update({ billing_email: billingEmail })
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) {
    console.warn("[billing] could not store billing email:", error.message);
  }
  if (provider === "stripe") {
    await admin
      .from("mod_billing_customers")
      .update({ billing_email: billingEmail })
      .eq("user_id", userId);
  }
}

/* ----------------------------- subscriptions ----------------------------- */

/** The jsonb row mod_billing_apply_subscription() takes. */
export function subscriptionRow(sub: NormalizedSubscription) {
  return {
    id: sub.id,
    user_id: sub.userId,
    price_id: sub.priceId,
    status: sub.status,
    quantity: sub.quantity ?? null,
    cancel_at_period_end: sub.cancelAtPeriodEnd ?? false,
    current_period_end: sub.currentPeriodEnd,
    provider: sub.provider,
    kind: sub.kind ?? "subscription",
    plan_id: sub.planId ?? null,
    entitlement: sub.entitlement ?? "premium",
    store: sub.store ?? "web",
    environment: sub.environment ?? null,
    org_id: sub.orgId ?? null,
    granted_by: sub.grantedBy ?? null,
    note: sub.note ?? null,
  };
}

/**
 * Apply a subscription (or one-time purchase) unless a NEWER provider event
 * already did — `eventAt` is the provider's event time, so ordering compares
 * the provider's clock with itself. Pass null to always apply (e.g. a
 * synchronous write right after checkout). Returns whether it was applied.
 */
export async function applySubscription(
  admin: AdminClient,
  sub: NormalizedSubscription,
  eventAt: Date | null,
): Promise<boolean> {
  const { data, error } = await admin.rpc("mod_billing_apply_subscription", {
    _row: subscriptionRow(sub) as unknown as Json,
    // The generated arg type is non-null, but the function accepts null
    // (no ordering stamp → always applies).
    _event_at: (eventAt ? eventAt.toISOString() : null) as unknown as string,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/* -------------------------------- catalog -------------------------------- */

export async function upsertProduct(
  admin: AdminClient,
  p: CatalogProduct,
): Promise<void> {
  const { error } = await admin.from("mod_billing_products").upsert({
    id: p.id,
    provider: p.provider,
    active: p.active,
    name: p.name,
    description: p.description ?? null,
    image: p.image ?? null,
    metadata: p.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

export async function upsertPrice(
  admin: AdminClient,
  p: CatalogPrice,
): Promise<void> {
  const { error } = await admin.from("mod_billing_prices").upsert({
    id: p.id,
    provider: p.provider,
    product_id: p.productId,
    active: p.active,
    unit_amount: p.unitAmount,
    currency: p.currency,
    type: p.type,
    interval: p.interval,
    interval_count: p.intervalCount,
    metadata: p.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}
