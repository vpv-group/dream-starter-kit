import "server-only";

import { createAdminClient } from "~/lib/supabase/admin";

/**
 * True while nobody is staff yet — the next sign-up is the founder's (the
 * first profile becomes staff). Used to show the site-license disclosure on
 * the founder's sign-up form. Service-role count (golden rule #2: server
 * only); any failure answers false (no notice) rather than breaking sign-up.
 */
export async function isFounderSignup(): Promise<boolean> {
  try {
    const { count, error } = await createAdminClient()
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_staff", true);
    return !error && count === 0;
  } catch {
    return false;
  }
}
