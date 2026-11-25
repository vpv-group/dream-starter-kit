import "server-only";

import { cache } from "react";

import { createClient } from "~/lib/supabase/server";

/**
 * Per-user module access (docs/MODULES.md → Access). Both checks run as the
 * signed-in user through their own RLS-scoped Supabase session, are memoized
 * per request, and FAIL CLOSED: an error means "no access".
 */

/** `profiles.is_staff` for the current session (false when signed out). */
export const isCurrentUserStaff = cache(async (): Promise<boolean> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("profiles")
      .select("is_staff")
      .eq("id", user.id)
      .maybeSingle();
    return data?.is_staff ?? false;
  } catch {
    return false;
  }
});

/**
 * Call a module's access check — the `mod_<slug>_*` SQL function its
 * manifest names in `access.check` (no args, returns boolean).
 */
export const hasModuleAccess = cache(
  async (check: string): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error } = await rpc(check);
      if (error) {
        console.error(`[mod-access] ${check} failed:`, error.message);
        return false;
      }
      return data === true;
    } catch (err) {
      console.error(`[mod-access] ${check} failed:`, (err as Error).message);
      return false;
    }
  },
);
