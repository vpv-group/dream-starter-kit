import type { AppSupabaseClient } from "@acme/api";

import type { NavUserContext } from "./native-nav";

/**
 * Per-user inputs to menu filtering (shared by useNavMenu and useNativeNav):
 * `profiles.is_staff`, and which gated modules' access checks deny the user.
 * Both run through the user's own Supabase session (RLS), and fail closed.
 */

/** `profiles.is_staff` for the signed-in user (false when signed out / on error). */
export async function fetchIsStaff(
  supabase: AppSupabaseClient,
): Promise<boolean> {
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
}

/** Slugs of gated modules whose access check denies this user (fails closed). */
export async function fetchDeniedModules(
  supabase: AppSupabaseClient,
  mods: { slug: string; accessCheck?: string | null }[],
): Promise<Set<string>> {
  const denied = new Set<string>();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
  ) => Promise<{ data: unknown; error: unknown }>;
  const checks = new Map<string, string>();
  for (const m of mods) if (m.accessCheck) checks.set(m.slug, m.accessCheck);
  await Promise.all(
    [...checks].map(async ([slug, fn]) => {
      const { data, error } = await rpc(fn);
      if (error || data !== true) denied.add(slug);
    }),
  );
  return denied;
}

export async function fetchNavUserContext(
  supabase: AppSupabaseClient,
  mods: { slug: string; accessCheck?: string | null }[],
): Promise<NavUserContext> {
  const [isStaff, deniedModules] = await Promise.all([
    fetchIsStaff(supabase).catch(() => false),
    fetchDeniedModules(supabase, mods),
  ]);
  return { isStaff, deniedModules };
}
