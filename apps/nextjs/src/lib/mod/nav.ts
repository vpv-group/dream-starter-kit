import "server-only";

import { cache } from "react";

import { navAudienceAllows } from "@acme/app";

import type { NavMenuItem } from "./nav-types";
import { modInstalled } from "~/mod/registry.data.generated";
import { hasModuleAccess, isCurrentUserStaff } from "./access";
import { buildNavTree } from "./nav-tree";
import { desiredNavItems } from "./reconcile-nav";

export type { NavMenuItem } from "./nav-types";

/**
 * The web app menu, resolved server-side from the CMS-driven `nav-items`
 * collection (staff-edited: rename/reorder/re-icon/toggle/group — live
 * without a redeploy), filtered to enabled items of enabled modules and
 * sorted by Payload's drag order, with submenu rows nested under their group
 * (lib/mod/nav-tree.ts). Per user: "Staff only" items are dropped for
 * non-staff, "Non-staff only" items for staff, and a module's items are dropped when its access check
 * (manifest `access.check`) denies the current user — filtered here on the
 * server, so they never reach the browser. Falls back to the generated defaults when the CMS is
 * unreachable (fresh deploy before bootstrap, local Postgres down) so the app
 * shell always renders.
 *
 * The menu rows come from a cross-request cache (lib/cms/cached-reads.ts)
 * that saving a nav item or module invalidates, so menu edits in /admin
 * still appear on the next request; the per-user filtering is per request.
 */
export const getWebNavItems = cache(async (): Promise<NavMenuItem[]> => {
  try {
    // Cross-request cached menu rows (invalidated on save); the per-user
    // filtering below runs on every request.
    const { readNavSource } = await import("../cms/cached-reads");
    const source = await readNavSource();
    const navRes = { docs: source.navItems };
    const mods = source.modules.flatMap((d) =>
      d.slug ? [{ ...d, slug: d.slug }] : [],
    );
    const disabled = new Set(
      mods.filter((d) => d.enabled === false).map((d) => d.slug),
    );
    const allowed = await allowedModules(
      mods.map((d) => ({ slug: d.slug, accessCheck: d.accessCheck })),
    );
    const isStaff = await isCurrentUserStaff();
    const items = buildNavTree(
      navRes.docs
        .filter((d) => d.enabled !== false)
        .filter((d) => (d.platforms ?? []).includes("web"))
        .filter((d) => navAudienceAllows(d, isStaff))
        .filter((d) => {
          const mod = typeof d.module === "object" ? d.module?.slug : undefined;
          return !mod || (!disabled.has(mod) && allowed(mod));
        }),
    );
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
  return buildNavTree(
    desiredNavItems()
      .filter((d) => d.platforms.includes("web"))
      .filter((d) => navAudienceAllows(d, isStaff))
      .filter((d) => !d.module || allowed(d.module))
      // The defaults have no ids yet: the key stands in for one.
      .map((d) => ({ ...d, id: d.key, parent: d.parentKey ?? null })),
  );
}
