import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "@acme/api";

import { getPayloadClient } from "~/lib/cms/payload-client";

/**
 * The billing module's host services (manifest `server.services`), reached
 * through the generated `modServices` registry — host code never imports
 * `@acme/mod-billing`. Null when billing isn't installed, so every caller
 * degrades (no premium, nothing to cancel, no tags).
 *
 * The interface is a STRUCTURAL copy of billing's `services`
 * (modules/billing/src/server/index.ts); keep the two in step.
 */
export interface BillingHostServices {
  getViewerEntitlement(
    supabase: SupabaseClient<Database>,
    user?: User | null,
  ): Promise<{ isPremium: boolean; isLoggedIn: boolean; email: string | null }>;
  onAccountDelete(input: { userId: string }): Promise<void>;
  onUserMerge(
    ctx: ServiceContext,
    input: { fromId: string; toId: string },
  ): Promise<void>;
  onUserCreated(ctx: ServiceContext, input: { userId: string }): Promise<void>;
  hasBillingRecord(input: { userId: string }): Promise<boolean>;
  /** The paywall's plan for a premium page (passed to the slot as-is). */
  getPremiumPlan(ctx: ServiceContext): Promise<unknown>;
}

interface ServiceContext {
  getPayload: typeof getPayloadClient;
}

/** What billing's services need from the host. */
export const billingServiceContext: ServiceContext = {
  getPayload: getPayloadClient,
};

/** Billing's services, or null when the module isn't installed. */
export async function billingServices(): Promise<BillingHostServices | null> {
  // Lazy: the server registry pulls in every module's server entry.
  const { modServices } = await import("~/mod/registry.server.generated");
  return (
    (modServices.billing as unknown as BillingHostServices | undefined) ?? null
  );
}
