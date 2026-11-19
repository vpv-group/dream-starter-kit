import "server-only";

import type { NextRequest } from "next/server";
import { createClient as createBearerClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";

import { env, supabaseAnonKey } from "~/env";
import { createClient as createCookieClient } from "~/lib/supabase/server";

/**
 * The caller's own RLS-scoped Supabase client for an API route: a Bearer
 * token (Expo) or the session cookie (web). Returns null when signed out.
 * Same contract as the module dispatcher's authenticate().
 */
export async function getRequestClient(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const supabase = authHeader
    ? createBearerClient<Database>(
        env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseAnonKey(),
        {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        },
      )
    : await createCookieClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { user, supabase };
}
