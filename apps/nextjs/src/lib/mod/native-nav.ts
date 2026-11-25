import "server-only";

import type { NativeNavConfig, NativeNavRow, NavItemRow } from "@acme/app";
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
  try {
    const { getPayloadClient } = await import("../cms/payload-client");
    const payload = await getPayloadClient();
    const [navRes, modRes, global] = await Promise.all([
      payload.find({
        collection: "nav-items",
        sort: "_order",
        pagination: false,
        depth: 1,
        overrideAccess: true,
      }),
      payload.find({
        collection: "kit-modules",
        pagination: false,
        depth: 0,
        overrideAccess: true,
      }),
      payload.findGlobal({
        slug: "native-navigation",
        depth: 1,
        draft: false,
        overrideAccess: true,
      }),
    ]);
    if (navRes.docs.length === 0) return defaultNativeNavConfig();

    const navItems: NavItemRow[] = navRes.docs.map((d) => ({
      key: d.key,
      label: d.label,
      href: d.href,
      icon: d.icon,
      platforms: d.platforms,
      audience: d.audience,
      enabled: d.enabled,
      module: typeof d.module === "object" ? d.module?.slug : null,
    }));
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
    return { version: nativeNavVersion(merged), ...merged };
  } catch {
    return defaultNativeNavConfig();
  }
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
