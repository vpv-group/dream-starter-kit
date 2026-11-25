import "server-only";

import { cache } from "react";

import type { NavMenuItem } from "./nav-types";
import { modInstalled } from "~/mod/registry.data.generated";
import { hasModuleAccess, isCurrentUserStaff } from "./access";
import { desiredNavItems } from "./reconcile-nav";

export type { NavMenuItem } from "./nav-types";

/**
 * The web app menu, resolved server-side from the CMS-driven `nav-items`
 * collection (staff-edited: rename/reorder/re-icon/toggle — live without a
 * redeploy), filtered to enabled items of enabled modules and sorted by
 * Payload's drag order. Per user: "Staff only" items are dropped for
 * non-staff, and a module's items are dropped when its access check
 * (manifest `access.check`) denies the current user — filtered here on the
 * server, so they never reach the browser. Falls back to the generated defaults when the CMS is
 * unreachable (fresh deploy before bootstrap, local Postgres down) so the app
 * shell always renders.
 *
 * Per-request memoized via React cache() like every lib/payload.ts reader —
 * no cross-request cache, so menu edits in /admin appear on the next request.
 */
export const getWebNavItems = cache(async (): Promise<NavMenuItem[]> => {
  try {
    const { getPayloadClient } = await import("../cms/payload-client");
    const payload = await getPayloadClient();
    const [navRes, modRes] = await Promise.all([
      payload.find({
        collection: "nav-items",
        sort: "_order",
        pagination: false,
        overrideAccess: true,
      }),
      payload.find({
        collection: "kit-modules",
        pagination: false,
        overrideAccess: true,
      }),
    ]);
    const mods = modRes.docs.flatMap((d) =>
      d.slug ? [{ ...d, slug: d.slug }] : [],
    );
    const disabled = new Set(
      mods.filter((d) => d.enabled === false).map((d) => d.slug),
    );
    const allowed = await allowedModules(
      mods.map((d) => ({ slug: d.slug, accessCheck: d.accessCheck })),
    );
    const isStaff = await isCurrentUserStaff();
    const items = navRes.docs
      .filter((d) => d.enabled !== false)
      .filter((d) => (d.platforms ?? []).includes("web"))
      .filter((d) => isStaff || d.audience !== "staff")
      .filter((d) => {
        const mod = typeof d.module === "object" ? d.module?.slug : undefined;
        return !mod || (!disabled.has(mod) && allowed(mod));
      })
      .map((d) => ({
        key: d.key,
        label: d.label,
        href: d.href,
        icon: d.icon ?? undefined,
      }));
    // An empty collection means the boot reconcile hasn't run yet (fresh DB
    // mid-request) — fall back to defaults rather than rendering no menu.
    return items.length > 0 ? items : await defaultWebNavItems();
  } catch {
    return defaultWebNavItems();
  }
});

/**
 * Which modules the current user may use: modules without an access check
 * always; gated ones only when their check passes (one call per gated module).
 */
async function allowedModules(
  mods: { slug: string; accessCheck?: string | null }[],
): Promise<(slug: string) => boolean> {
  const denied = new Set<string>();
  await Promise.all(
    mods.map(async (m) => {
      if (m.accessCheck && !(await hasModuleAccess(m.accessCheck)))
        denied.add(m.slug);
    }),
  );
  return (slug) => !denied.has(slug);
}

/** The generated defaults (core + manifests) — the no-CMS fallback menu. */
export async function defaultWebNavItems(): Promise<NavMenuItem[]> {
  const [isStaff, allowed] = await Promise.all([
    isCurrentUserStaff(),
    allowedModules(modInstalled),
  ]);
  return desiredNavItems()
    .filter((d) => d.platforms.includes("web"))
    .filter((d) => isStaff || d.audience !== "staff")
    .filter((d) => !d.module || allowed(d.module))
    .map((d) => ({ key: d.key, label: d.label, href: d.href, icon: d.icon }));
}
