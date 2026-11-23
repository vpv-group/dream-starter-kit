import type { CollectionConfig } from "payload";

import { anyone, isAdmin } from "../access";

/**
 * Framework-owned registry of installed modules (docs/MODULES-PLAN.md
 * §2.5) — one row per module, created/updated ONLY by the boot-time
 * reconcile (lib/mod/reconcile-nav.ts, Local API with overrideAccess). Staff
 * use it for the runtime Enable/Disable toggle; `pnpm mod remove` is the real
 * uninstall.
 *
 * Read access is public: the native app reads `enabled` to filter its menu,
 * and the only data here is slug/name/version metadata already shipped in the
 * client bundle's generated registry.
 *
 * Its list view is also the Modules management page: the Source and Actions
 * columns (UI fields), the catalog, the operations panel, and the Install
 * from GitHub / Upload ZIP sidebar come from components/KitModulesCells.tsx
 * and components/KitModulesPanels.tsx. Every install/update/remove
 * dispatches module-ops.yml and lands as a PR (docs/MODULES.md).
 */
export const KitModules: CollectionConfig = {
  slug: "kit-modules",
  labels: { singular: "Module", plural: "Modules" },
  admin: {
    group: "Modules",
    useAsTitle: "name",
    // Slug stays available from the Columns menu; left out by default so the
    // table fits beside the install sidebar.
    defaultColumns: ["name", "version", "source", "enabled", "actions"],
    description:
      "Installed modules. Disabling hides a module's menu items and 404s its pages and API at runtime without uninstalling it. Install, update and remove open a PR through module ops.",
    components: {
      beforeListTable: [
        "~/payload/components/KitModulesPanels#KitModulesNotices",
      ],
      afterList: ["~/payload/components/KitModulesPanels#KitModulesExtras"],
    },
  },
  access: {
    read: anyone,
    update: isAdmin,
    create: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    { name: "name", type: "text", required: true, admin: { readOnly: true } },
    {
      name: "version",
      type: "text",
      required: true,
      admin: {
        readOnly: true,
        description: "Mirrored from the bundled modules.lock at boot.",
        components: {
          Cell: "~/payload/components/KitModulesCells#KitModuleVersionCell",
        },
      },
    },
    {
      // List column only (no data): origin + system/pinned/license status.
      name: "source",
      type: "ui",
      label: "Source",
      admin: {
        components: {
          Cell: "~/payload/components/KitModulesCells#KitModuleSourceCell",
        },
      },
    },
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description:
          "Uncheck to hide this module from menus and block its pages/API. Code stays deployed; re-enable any time.",
      },
    },
    {
      name: "system",
      type: "checkbox",
      defaultValue: false,
      admin: {
        readOnly: true,
        description:
          "The app shell depends on this module's mounts (e.g. the home screen) — disabling it will break core navigation.",
      },
    },
    {
      // List column only (no data): Update, Remove.
      name: "actions",
      type: "ui",
      label: "Actions",
      admin: {
        components: {
          Cell: "~/payload/components/KitModulesCells#KitModuleActionsCell",
        },
      },
    },
  ],
};
