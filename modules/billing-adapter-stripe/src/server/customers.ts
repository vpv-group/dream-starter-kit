import "server-only";

import type { User } from "@supabase/supabase-js";
import type Stripe from "stripe";

import {
  createAdminClient,
  findCustomerSubject,
  findCustomerUser,
  findOrgCustomer,
  findUserCustomer,
  linkCustomer,
  linkOrgCustomer,
} from "@acme/mod-billing/server";

/**
 * Ensure the Stripe customer carries the buyer's email + name. Sets the name
 * whenever provided, and the email only when the customer doesn't already have
 * one (so a signed-in user's account email is never overwritten by a different
 * wallet email). Best-effort: a failure here must not abort checkout.
 */
export async function applyCustomerIdentity(
  stripe: Stripe,
  customerId: string,
  buyer: { email?: string; name?: string },
): Promise<void> {
  if (!buyer.email && !buyer.name) return;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return;
    const update: Stripe.CustomerUpdateParams = {};
    if (buyer.name && !customer.name) update.name = buyer.name;
    if (buyer.email && !customer.email) update.email = buyer.email;
    if (Object.keys(update).length > 0) {
      await stripe.customers.update(customerId, update);
    }
  } catch (err) {
    console.error("[stripe] could not set customer identity:", err);
  }
}

/**
 * Whether a stored Stripe customer id still resolves to a live customer. A
 * saved customer can vanish — deleted in the dashboard, test data wiped, or a
 * test↔live key switch — leaving a stale `mod_billing_customers` row. Reusing a
 * dead id makes EVERY checkout fail with `No such customer: cus_…`, so callers
 * must validate before reuse. Returns false for a missing/deleted customer;
 * rethrows other (e.g. transient) Stripe errors so they aren't masked as "gone".
 */
async function customerExists(
  stripe: Stripe,
  customerId: string,
): Promise<boolean> {
  try {
    const c = await stripe.customers.retrieve(customerId);
    return !(c as Stripe.DeletedCustomer).deleted;
  } catch (err) {
    if ((err as { code?: string }).code === "resource_missing") return false;
    throw err;
  }
}

/**
 * Resolve (or create) a Stripe customer for the current request — signed-in
 * users reuse their saved customer; guests get a fresh blank customer the
 * Express Checkout / Payment Element fills in (the webhook matches by email).
 * Shared by /checkout and /express-intent.
 *
 * The saved id is reused only if it still exists in Stripe (see
 * `customerExists`); a stale one is replaced by find-by-email-or-create and the
 * customer link is healed (billing's linkCustomer, service role) so the next request and the webhook resolve the live one.
 */
export async function resolveCustomer(
  stripe: Stripe,
  user: User | null,
): Promise<string | undefined> {
  if (!user) return undefined;
  const admin = createAdminClient();
  const stored =
    (await findUserCustomer(admin, user.id, "stripe")) ?? undefined;
  if (stored && (await customerExists(stripe, stored))) return stored;

  const createFresh = async () =>
    (
      await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
    ).id;

  // Try to reconnect the user to an existing Stripe customer with their email
  // (e.g. one created by a prior guest checkout). Only adopt it when it's safe:
  //   - its Stripe metadata isn't stamped for a DIFFERENT Supabase user, AND
  //   - no customer link already maps it to a DIFFERENT user.
  // Otherwise create a fresh customer. This prevents cross-linking two
  // accounts to one Stripe customer (email can be reused after an account
  // email change / shared Stripe account).
  const candidate = user.email
    ? (await stripe.customers.list({ email: user.email, limit: 1 })).data[0]
    : undefined;
  let resolved: string;
  const metaOwner = candidate?.metadata.supabase_user_id;
  if (candidate && (!metaOwner || metaOwner === user.id)) {
    const owner = await findCustomerUser(admin, "stripe", candidate.id);
    resolved = !owner || owner === user.id ? candidate.id : await createFresh();
  } else {
    resolved = await createFresh();
  }

  // Heal the stored link when it was missing or pointed at a dead customer.
  if (resolved !== stored) {
    await linkCustomer(admin, {
      userId: user.id,
      provider: "stripe",
      customerId: resolved,
    }).catch((err: unknown) => {
      console.error("[stripe] could not heal customer link:", err);
    });
  }
  return resolved;
}

/**
 * The workspace's Stripe customer (company billing), created on first
 * purchase with the workspace's name and the buyer's email, and linked to the
 * workspace — never to the buyer personally. A stale stored id is replaced.
 */
export async function resolveOrgCustomer(
  stripe: Stripe,
  orgId: string,
  buyer: User,
): Promise<string> {
  const admin = createAdminClient();
  const stored = await findOrgCustomer(admin, orgId, "stripe");
  if (stored && (await customerExists(stripe, stored))) return stored;
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const created = await stripe.customers.create({
    name: org?.name ?? undefined,
    email: buyer.email ?? undefined,
    metadata: { org_id: orgId, supabase_user_id: buyer.id },
  });
  await linkOrgCustomer(admin, {
    orgId,
    provider: "stripe",
    customerId: created.id,
  });
  return created.id;
}

export { findCustomerSubject };
