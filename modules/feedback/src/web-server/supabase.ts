import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@acme/api";

/**
 * The visitor's own Supabase client for the portal's server-rendered pages
 * (session cookie → RLS decides what they see). Cookie writes are a no-op in
 * Server Components; the host's proxy refreshes sessions.
 */
export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // The host's env falls back to the publishable key when the anon key is the
  // Vercel placeholder (apps/nextjs/src/env.ts → supabaseAnonKey()).
  const key =
    anon && anon !== "set-in-vercel-env"
      ? anon
      : (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? anon);
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / anon key must be set.");
  }
  const store = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // Server Component: read-only cookie store.
        }
      },
    },
  });
}
