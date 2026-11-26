"use client";

import type {
  BillingWebProvider,
  BuyerDetails,
  CreatedPurchase,
} from "@acme/mod-billing";

/** The embedded purchase routes (src/server/routes.ts). */
const API = "/api/mod/billing-adapter-stripe";

async function post<T>(
  path: string,
  body: unknown,
): Promise<T & { error?: string }> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/**
 * Create the PaymentIntent / subscription at CONFIRM time (deferred flow).
 * The buyer details are forwarded so the server stamps the Stripe customer's
 * email + name (carried onto every future invoice/receipt).
 */
export async function createPurchase(
  planId: string | number,
  details?: BuyerDetails,
): Promise<CreatedPurchase> {
  const data = await post<Partial<CreatedPurchase>>("/express-intent", {
    planId,
    email: details?.email ?? undefined,
    name: details?.name ?? undefined,
  }).catch((err: unknown) => {
    throw err instanceof Error ? err : new Error("Could not start checkout.");
  });
  if (!data.clientSecret) throw new Error("Could not start checkout.");
  return {
    clientSecret: data.clientSecret,
    mode: data.mode ?? "payment",
    subscriptionId: data.subscriptionId,
    customerId: data.customerId,
  };
}

export const completeGuestPurchase: NonNullable<
  BillingWebProvider["completeGuestPurchase"]
> = async ({ email, name, phone, address, ref }) => {
  const data = await post<{ loginToken?: string }>("/guest-account", {
    email,
    name: name ?? undefined,
    phone: phone ?? undefined,
    // Wallet billing address (incl. zip) → stored on the Supabase user and
    // mirrored into cms.users.address.
    address: address ?? undefined,
    subscriptionId: ref.subscriptionId,
    customerId: ref.customerId,
  });
  return { loginToken: data.loginToken };
};

export const switchPlan: NonNullable<
  BillingWebProvider["switchPlan"]
> = async ({ planId, ref, email }) => {
  const data = await post<{ ok?: boolean }>("/upgrade-annual", {
    planId,
    // Upgrade this exact subscription without depending on the
    // (webhook-written, possibly not-yet-present) customer link.
    subscriptionId: ref.subscriptionId,
    // Guest (no session): verified against the subscription's customer.
    email,
  });
  if (!data.ok) throw new Error(data.error ?? "Could not switch plans.");
};
