"use client";

import { useQuery } from "@tanstack/react-query";

import { useSession, useSupabase } from "@acme/api";

/**
 * Premium gating — reads the user's active entitlements (the
 * mod_billing_entitlements view, RLS read-own) whatever sold them: web
 * checkout, an app store, a promotion. Identical on web + native; payment
 * providers' webhooks are the only writers of the ledger behind it.
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
        .select("status, price_id, provider, store, expires_at")
        .eq("entitlement", "premium")
        .order("expires_at", { ascending: false, nullsFirst: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return {
    isPremium: !!query.data,
    subscription: query.data ?? null,
    isLoading: query.isLoading,
  };
}
