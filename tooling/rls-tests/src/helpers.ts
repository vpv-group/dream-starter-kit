/**
 * Shared helpers for RLS suites — the kit's own (src/rls.test.ts) and
 * module-owned ones (modules/<slug>/tests/rls/*.test.ts, picked up by this
 * package's vitest config). Import from "@acme/rls-tests/helpers".
 *
 * Uses the SERVICE ROLE key from .env — test tooling only (golden rule #2).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api/types";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const rawAnon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const rawService = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!rawUrl || !rawAnon || !rawService) {
  throw new Error(
    "RLS tests require NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY " +
      "and SUPABASE_SERVICE_ROLE_KEY (run them with `pnpm test:rls`).",
  );
}

export const SUPABASE_URL = rawUrl;
export const ANON_KEY = rawAnon;
export const SERVICE_KEY = rawService;

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client (bypasses RLS) for fixtures and assertions. */
export const admin: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SERVICE_KEY,
  noPersist,
);

/** A unique, valid test email. */
export const testEmail = (tag: string) =>
  `${tag}-${Date.now()}-${Math.round(Math.random() * 1e6)}@test.local`;

/**
 * Create a confirmed user and return its id. Never staff: on a fresh
 * database the first permanent signup becomes the founder (staff) via
 * handle_new_user, which would make whichever suite runs first see its
 * "member" as staff. Suites that need staff set `is_staff` explicitly.
 */
export async function createUser(
  email: string,
  password = "password123!",
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const reset = await admin
    .from("profiles")
    .update({ is_staff: false })
    .eq("id", data.user.id)
    .eq("is_staff", true);
  if (reset.error) throw reset.error;
  return data.user.id;
}

/** A client signed in as `email` (anon key + the user's session → RLS). */
export async function signIn(
  email: string,
  password = "password123!",
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, noPersist);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/** A client with no session at all (the `anon` role). */
export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, noPersist);
}

/** A client signed in as a fresh Supabase anonymous user. */
export async function anonymousUser(): Promise<SupabaseClient<Database>> {
  const client = anonClient();
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return client;
}
