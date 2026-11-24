"use client";

import { useQuery } from "@tanstack/react-query";

import type { AppSupabaseClient } from "@acme/api";
import type { KitModule, NavItem } from "@acme/cms";
import { useSupabase } from "@acme/api";

/**
 * The CMS-driven app menu (nav-items collection — staff rename/reorder/
 * re-icon/toggle entries in /admin, docs/MODULES-PLAN.md §2.5), read over
 * the public /cms-api REST endpoint and filtered to enabled items of enabled
 * modules — and, per user, to items they may see: "Staff only" items need
 * `profiles.is_staff`, and a module's items need its access check (manifest
 * `access.check`, a SQL function) to pass. Those checks run through the
 * user's own Supabase session. Used by the native home/menu; the web sidebar reads the same
 * collection server-side via the Payload Local API (apps/nextjs/src/lib/mod/nav.ts).
 *
 * Callers render a static fallback while loading/offline (react-query keeps
 * the last-known-good response cached).
 */
// `process.env.*_PUBLIC_*` is inlined by each platform's bundler (Metro / Next).
declare const process: { env: Record<string, string | undefined> };

const CMS_BASE =
  process.env.EXPO_PUBLIC_CMS_URL ?? process.env.NEXT_PUBLIC_CMS_URL ?? "";

export interface NavMenuEntry {
  key: string;
  label: string;
  href: string;
  icon?: string;
}

interface Paginated<T> {
  docs: T[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${CMS_BASE}/cms-api/${path}`);
  if (!res.ok) throw new Error(`CMS request failed (${res.status})`);
  return (await res.json()) as T;
}

/** `profiles.is_staff` for the signed-in user (false when signed out / on error). */
async function fetchIsStaff(supabase: AppSupabaseClient): Promise<boolean> {
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
async function fetchDeniedModules(
  supabase: AppSupabaseClient,
  mods: KitModule[],
): Promise<Set<string>> {
  const denied = new Set<string>();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
  ) => Promise<{ data: unknown; error: unknown }>;
  await Promise.all(
    mods.map(async (m) => {
      if (!m.accessCheck) return;
      const { data, error } = await rpc(m.accessCheck);
      if (error || data !== true) denied.add(m.slug);
    }),
  );
  return denied;
}

export function useNavMenu(platform: "web" | "native" = "native") {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["nav-menu", platform],
    staleTime: 60_000,
    queryFn: async (): Promise<NavMenuEntry[]> => {
      const [nav, mods] = await Promise.all([
        fetchJson<Paginated<NavItem>>(
          `nav-items?limit=200&sort=_order&depth=1&where[enabled][equals]=true`,
        ),
        fetchJson<Paginated<KitModule>>(`kit-modules?limit=200&depth=0`),
      ]);
      const disabled = new Set(
        mods.docs.filter((d) => d.enabled === false).map((d) => d.slug),
      );
      const [isStaff, denied] = await Promise.all([
        fetchIsStaff(supabase).catch(() => false),
        fetchDeniedModules(supabase, mods.docs),
      ]);
      return nav.docs
        .filter((d) => (d.platforms ?? []).includes(platform))
        .filter((d) => isStaff || d.audience !== "staff")
        .filter((d) => {
          const mod = typeof d.module === "object" ? d.module?.slug : undefined;
          return !mod || (!disabled.has(mod) && !denied.has(mod));
        })
        .map((d) => ({
          key: d.key,
          label: d.label,
          href: d.href,
          icon: d.icon ?? undefined,
        }));
    },
  });
}
