import "server-only";

import { cache } from "react";

import type { NativeNavConfig } from "@acme/app";

import type { WebTabMenu } from "./web-tab-menu-core";
import { modNavDefaults } from "~/mod/registry.data.generated";
import { hasModuleAccess, isCurrentUserStaff } from "./access";
import { loadNativeNav } from "./native-nav";
import { buildWebTabMenu } from "./web-tab-menu-core";

export type { WebTabMenu } from "./web-tab-menu-core";

/**
 * The web app's mobile/tablet bottom tab bar (components/glass-tab-bar.tsx)
 * mirrors the iOS + Android tab bar: same rows, order, tab count and
 * "hide on native" flags, staff-edited on /admin → Navigation ("iOS and
 * Android App") and read from the same published `native-navigation`
 * global (lib/mod/native-nav.ts). Two things are translated for the web:
 *
 *   - hrefs: a module's native screen can live at a different path than its
 *     web page (dashboard: native `/home`, web `/a`; billing: native
 *     `/a/billing`, web `/billing`). See `webHrefFor`.
 *   - icons: native draws SF / Material symbols; the web uses the row's
 *     Tabler icon from `nav-items` (the sidebar's icon set).
 *
 * Filtered per user on the server (staff-only rows, module access checks),
 * exactly like the sidebar menu (lib/mod/nav.ts).
 */
export const getWebTabMenu = cache(async (): Promise<WebTabMenu> => {
  const { config, icons } = await loadNativeNav();
  const [isStaff, deniedModules] = await Promise.all([
    isCurrentUserStaff(),
    deniedModulesFor(config),
  ]);
  return buildWebTabMenu(
    config,
    icons,
    { isStaff, deniedModules },
    modNavDefaults.web,
  );
});

/** Modules whose access check denies the current user (one RPC per check). */
async function deniedModulesFor(config: NativeNavConfig): Promise<Set<string>> {
  const checks = new Map<string, string>();
  for (const item of config.items) {
    if (item.module && item.accessCheck)
      checks.set(item.module, item.accessCheck);
  }
  const denied = new Set<string>();
  await Promise.all(
    [...checks].map(async ([slug, check]) => {
      if (!(await hasModuleAccess(check))) denied.add(slug);
    }),
  );
  return denied;
}
