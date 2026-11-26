"use client";

import { useQuery } from "@tanstack/react-query";

import { useSession, useSupabase } from "@acme/api";

/**
 * Premium gating for content. Reads the user's active entitlements — billing's
 * mod_billing_entitlements view (RLS read-own), whatever sold them — the same
 * source the billing module's `usePremium` uses, without importing
 * `@acme/mod-billing` from host code (the CLAUDE.md module-boundary rule).
 * Anonymous visitors are never premium (the gate shows the paywall; checkout
 * supports guest/anon purchase + post-pay account conversion).
 */
export function usePremium() {
  const supabase = useSupabase();
  const { user } = useSession();

  const query = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mod_billing_entitlements")
        .select("status")
        .eq("entitlement", "premium")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return {
    isPremium: !!query.data,
    isLoading: !!user && query.isLoading,
    userEmail: user?.email ?? null,
  };
}
