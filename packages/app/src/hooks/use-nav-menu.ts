"use client";

import { useQuery } from "@tanstack/react-query";

import type { KitModule, NavItem } from "@acme/cms";

/**
 * The CMS-driven app menu (nav-items collection — staff rename/reorder/
 * re-icon/toggle entries in /admin, docs/MODULES-PLAN.md §2.5), read over
 * the public /cms-api REST endpoint and filtered to enabled items of enabled
 * modules. Used by the native home/menu; the web sidebar reads the same
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

export function useNavMenu(platform: "web" | "native" = "native") {
  return useQuery({
    queryKey: ["nav-menu", platform],
    staleTime: 60_000,
    queryFn: async (): Promise<NavMenuEntry[]> => {
      const [nav, disabledMods] = await Promise.all([
        fetchJson<Paginated<NavItem>>(
          `nav-items?limit=200&sort=_order&depth=1&where[enabled][equals]=true`,
        ),
        fetchJson<Paginated<KitModule>>(
          `kit-modules?limit=200&where[enabled][equals]=false`,
        ),
      ]);
      const disabled = new Set(disabledMods.docs.map((d) => d.slug));
      return nav.docs
        .filter((d) => (d.platforms ?? []).includes(platform))
        .filter((d) => {
          const mod = typeof d.module === "object" ? d.module?.slug : undefined;
          return !mod || !disabled.has(mod);
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
