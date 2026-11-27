import { createClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";

/**
 * Service-role Supabase client — BYPASSES RLS (golden rule #2: server-only;
 * reachable only from ./server and ./payload). Used to copy Payload config
 * into the module's tables, for anonymous writes after the module has checked
 * the board's settings, and to notify other users.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  // SUPABASE_SECRET_KEY: Vercel's Supabase Marketplace name for it.
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set " +
        "for the feedback module — see .env.example.",
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
