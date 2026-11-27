import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "@acme/api";

/** What the viewer may see, whatever store sold it. */
export interface ViewerEntitlement {
  isPremium: boolean;
  /** Signed in with a permanent account (anonymous users aren't members). */
  isLoggedIn: boolean;
  email: string | null;
}

const NONE: ViewerEntitlement = {
  isPremium: false,
  isLoggedIn: false,
  email: null,
};

/**
 * The viewer's entitlement from their OWN session (RLS read-own on the
 * mod_billing_entitlements view) — the server twin of `usePremium`. Fails
 * closed: any error means not premium, so locked content is never shipped.
 */
export async function entitlementFor(
  supabase: SupabaseClient<Database>,
  user?: User | null,
): Promise<ViewerEntitlement> {
  try {
    const viewer =
      user === undefined ? (await supabase.auth.getUser()).data.user : user;
    if (!viewer || viewer.is_anonymous) return NONE;
    // RLS (security_invoker view) returns the viewer's own entitlements and
    // those of every workspace they belong to — a company plan counts.
    const { data, error } = await supabase
      .from("mod_billing_entitlements")
      .select("entitlement")
      .eq("entitlement", "premium")
      .limit(1);
    return {
      isPremium: !error && data.length > 0,
      isLoggedIn: true,
      email: viewer.email ?? null,
    };
  } catch {
    return NONE;
  }
}
