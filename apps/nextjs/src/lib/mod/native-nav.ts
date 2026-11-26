import "server-only";

import { cache } from "react";

import type { NativeNavConfig, NativeNavRow, NavItemRow } from "@acme/app";
import type { NativeNavigation } from "@acme/cms";
import { mergeNativeNav, nativeNavVersion } from "@acme/app";

import { desiredNavItems } from "./reconcile-nav";

/**
 * The iOS + Android app menu config (GET /api/nav/native): the PUBLISHED
 * `native-navigation` global merged with the live native `nav-items` rows
 * and module enablement (`mergeNativeNav` in @acme/app). Not per-user — the
 * app filters staff-only rows and module access checks itself, through the
 * user's own Supabase session, exactly like the web menu does server-side.
 *
 * Falls back to the generated defaults when the CMS is unreachable (fresh
 * deploy before bootstrap), so the app always gets a menu.
 */
export async function getNativeNavConfig(): Promise<NativeNavConfig> {
  return (await loadNativeNav()).config;
}

/** The native menu config plus each row's Tabler icon name, keyed by nav key. */
export interface LoadedNativeNav {
  config: NativeNavConfig;
  /**
   * `nav-items` icon names (the web sidebar's Tabler set). The config itself
   * only carries native symbols; the web tab bar (lib/mod/web-tab-menu.ts)
   * renders these instead.
   */
  icons: Map<string, string | undefined>;
}

/**
 * Shared loader for GET /api/nav/native and the web tab bar. Per-request
 * memoized (React cache), like the other CMS readers.
 */
export const loadNativeNav = cache(async (): Promise<LoadedNativeNav> => {
  try {
    // Cross-request cached (invalidated when nav items, modules or the
    // native-navigation global are saved).
    const { readCachedGlobal, readNavSource } =
      await import("../cms/cached-reads");
    const [source, global] = await Promise.all([
      readNavSource(),
      readCachedGlobal<NativeNavigation>("native-navigation", 1),
    ]);
    const navRes = { docs: source.navItems };
    const modRes = { docs: source.modules };
    if (navRes.docs.length === 0) return defaultLoadedNativeNav();

    // Staff-made groups have no link (and are web-only): not native rows.
    const navItems: NavItemRow[] = navRes.docs.flatMap((d) =>
      d.href
        ? [
            {
              key: d.key,
              label: d.label,
              href: d.href,
              icon: d.icon,
              platforms: d.platforms,
              audience: d.audience,
              enabled: d.enabled,
              module: typeof d.module === "object" ? d.module?.slug : null,
            },
          ]
        : [],
    );
    const rows: NativeNavRow[] = (global.items ?? []).flatMap((r) =>
      typeof r.item === "object"
        ? [
            {
              key: r.item.key,
              hidden: r.hidden,
              sfSymbol: r.sfSymbol,
              materialIcon: r.materialIcon,
            },
          ]
        : [],
    );
    const merged = mergeNativeNav({
      navItems,
      rows,
      modules: modRes.docs.flatMap((d) =>
        d.slug ? [{ ...d, slug: d.slug }] : [],
      ),
      tabCount: global.tabCount,
    });
    return {
      config: { version: nativeNavVersion(merged), ...merged },
      icons: new Map(navItems.map((n) => [n.key, n.icon ?? undefined])),
    };
  } catch {
    return defaultLoadedNativeNav();
  }
});

function defaultLoadedNativeNav(): LoadedNativeNav {
  return {
    config: defaultNativeNavConfig(),
    icons: new Map(desiredNavItems().map((d) => [d.key, d.icon])),
  };
}

/** The generated defaults (core + manifests) — the no-CMS fallback. */
export function defaultNativeNavConfig(): NativeNavConfig {
  const merged = mergeNativeNav({
    navItems: desiredNavItems().map((d) => ({
      ...d,
      module: d.module ?? null,
      enabled: true,
    })),
    rows: [],
    modules: [],
  });
  return { version: nativeNavVersion(merged), ...merged };
}
