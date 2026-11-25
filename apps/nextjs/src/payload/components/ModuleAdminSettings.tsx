"use client";

import { modAdminComponents } from "~/mod/registry.admin.generated";

/**
 * Renders a module's own settings component (manifest
 * admin.settingsComponent → its `./admin` AdminSettings) on the module's page
 * in /admin. One static wrapper keeps Payload's import map unchanged when
 * modules are installed or removed; `pnpm mod sync` regenerates the registry.
 */
export function ModuleAdminSettings({ slug }: { slug: string }) {
  const Settings = modAdminComponents[slug];
  if (!Settings) return null;
  return (
    <div className="mod-admin-settings" style={{ marginBottom: 32 }}>
      <Settings />
    </div>
  );
}
