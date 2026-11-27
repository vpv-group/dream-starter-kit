import type {
  CollectionAfterChangeHook,
  CollectionConfig,
  Field,
  GlobalAfterChangeHook,
} from "payload";

import {
  modAdminSettings,
  modSettings,
} from "~/mod/registry.payload.generated";
import { adminFieldAccess, anyone, isAdmin, staffFieldAccess } from "../access";

/**
 * Each module's settings render on ITS page here (Modules → <module>):
 * a group of the module's own fields (`defineModuleSettings`), shown only on
 * that module's row, and/or the module's own React settings component
 * (manifest `admin.settingsComponent`, exported from its `./admin` entry).
 * Fields are staff-readable (or public when the module opted in) and
 * admin-editable, like the per-module globals they replace.
 */
const onlyFor =
  (slug: string) =>
  (data: Partial<Record<string, unknown>> | undefined): boolean =>
    data?.slug === slug;

const settingsFields: Field[] = Object.values(modSettings).map((s) => ({
  name: s.groupName,
  type: "group" as const,
  label: "Settings",
  admin: { condition: onlyFor(s.slug) },
  access: {
    read: s.publicRead ? () => true : staffFieldAccess,
    update: adminFieldAccess,
  },
  fields: s.global.fields,
}));

// An adapter's panel (e.g. the Stripe connector) renders on its target
// module's page (`page`, e.g. Modules → Billing), after the module's own.
const adminSettingsFields: Field[] = modAdminSettings.map((a) => ({
  name: `admin_${a.slug.replace(/-/g, "_")}`,
  type: "ui" as const,
  admin: {
    condition: onlyFor(a.page ?? a.slug),
    components: {
      Field: {
        path: "~/payload/components/ModuleAdminSettings#ModuleAdminSettings",
        clientProps: { slug: a.slug },
      },
    },
  },
}));

/**
 * Module settings hooks (a module sets them on its settings `global`, e.g.
 * docs' "Sync now") run when that module's page is saved, with the module's
 * settings as `doc` — the shape they had as a global. Skipped for the
 * reconcile's one-time copy (`context.skipModuleSettingsHooks`).
 */
const runModuleSettingsHooks: CollectionAfterChangeHook<{
  id: number;
  slug: string;
}> = async ({ doc, previousDoc, req, context }) => {
  if (context.skipModuleSettingsHooks) return doc;
  const settings = Object.values(modSettings).find((s) => s.slug === doc.slug);
  if (!settings) return doc;
  const hooks: GlobalAfterChangeHook[] =
    settings.global.hooks?.afterChange ?? [];
  const groupOf = (d: unknown): Record<string, unknown> =>
    ((d as Record<string, unknown> | undefined)?.[settings.groupName] ??
      {}) as Record<string, unknown>;
  for (const hook of hooks) {
    await hook({
      doc: groupOf(doc),
      previousDoc: groupOf(previousDoc),
      data: groupOf(doc),
      req,
      context,
      global: settings.global,
    } as unknown as Parameters<GlobalAfterChangeHook>[0]);
  }
  return doc;
};

/** Modules with no settings of their own get a placeholder on their page. */
const slugsWithSettings = new Set([
  ...Object.values(modSettings).map((s) => s.slug),
  ...modAdminSettings.map((a) => a.page ?? a.slug),
]);

const COMPONENTS = "~/payload/components/modules";

/** Kept as data + list columns, but shown in the sidebar panel instead. */
const hiddenInForm = () => false;

/**
 * Framework-owned registry of installed modules (docs/MODULES-PLAN.md
 * §2.5) — one row per module, created/updated ONLY by the boot-time
 * reconcile (lib/mod/reconcile-nav.ts, Local API with overrideAccess).
 *
 * This is THE Modules screen (docs/MODULES.md → Admin panel):
 * - list: version (+ update available), source/license, enabled/system
 *   cells; a status banner for module ops; "Install module" next to the
 *   title (the Dream catalog) — installs dispatch module-ops and land as PRs.
 * - module page: its settings in the main column; Enabled + a "Module" panel
 *   (version, update, source, license, menu link, remove) in the sidebar.
 * `pnpm mod remove` (or Remove → PR) is the real uninstall; the Enabled
 * toggle only hides it at runtime.
 *
 * Read access is public: the native app reads `enabled` to filter its menu,
 * and the only data here is slug/name/version metadata already shipped in the
 * client bundle's generated registry.
 */
export const KitModules: CollectionConfig = {
  slug: "kit-modules",
  labels: { singular: "Module", plural: "Modules" },
  admin: {
    group: "Modules",
    useAsTitle: "name",
    defaultColumns: ["name", "version", "source", "enabled"],
    description:
      "Installed modules. Disabling a module hides its menu items and blocks its pages and API without uninstalling it.",
    components: {
      beforeListTable: [
        `${COMPONENTS}/ModulesStatusBanner#ModulesStatusBanner`,
      ],
      // Also puts "Install module" next to the list title (Create New's spot).
      Description: `${COMPONENTS}/InstallModuleAction#ModulesListDescription`,
    },
  },
  access: {
    read: anyone,
    update: isAdmin,
    create: () => false,
    delete: () => false,
  },
  hooks: { afterChange: [runModuleSettingsHooks] },
  fields: [
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true, condition: hiddenInForm },
    },
    {
      name: "name",
      type: "text",
      required: true,
      admin: { readOnly: true, condition: hiddenInForm },
    },
    {
      name: "version",
      type: "text",
      required: true,
      admin: {
        readOnly: true,
        condition: hiddenInForm,
        description: "Mirrored from the bundled modules.lock at boot.",
        components: { Cell: `${COMPONENTS}/ModuleCells#ModuleVersionCell` },
      },
    },
    {
      // List-only column: where the module came from + license state.
      name: "source",
      type: "ui",
      label: "Source",
      admin: {
        components: {
          Cell: `${COMPONENTS}/ModuleCells#ModuleSourceCell`,
        },
      },
    },
    {
      name: "enabled",
      type: "checkbox",
      label: "Enabled",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description:
          "Uncheck to hide this module from menus and block its pages and API. Code stays deployed; re-enable any time.",
        components: { Cell: `${COMPONENTS}/ModuleCells#ModuleEnabledCell` },
      },
    },
    {
      name: "moduleInfo",
      type: "ui",
      admin: {
        position: "sidebar",
        disableListColumn: true,
        components: {
          Field: `${COMPONENTS}/ModuleInfoPanel#ModuleInfoPanel`,
        },
      },
    },
    {
      name: "system",
      type: "checkbox",
      defaultValue: false,
      admin: {
        readOnly: true,
        condition: hiddenInForm,
        description:
          "The app shell depends on this module's mounts (e.g. the home screen) — disabling it will break core navigation.",
      },
    },
    {
      // Framework-owned (manifest access.check): the SQL function that says
      // whether the current user may use the module. Read by the web menu and
      // the native menu (useNavMenu) to hide gated modules' entries.
      name: "accessCheck",
      type: "text",
      admin: { readOnly: true, hidden: true },
    },
    {
      // Set once the module's legacy settings global was copied onto this
      // row (lib/mod/reconcile-nav.ts) — never copies twice.
      name: "settingsCopied",
      type: "checkbox",
      defaultValue: false,
      admin: { readOnly: true, hidden: true },
    },
    ...settingsFields,
    ...adminSettingsFields,
    {
      name: "noSettings",
      type: "ui",
      admin: {
        disableListColumn: true,
        condition: (data) =>
          typeof data.slug === "string" && !slugsWithSettings.has(data.slug),
        components: {
          Field: `${COMPONENTS}/ModuleInfoPanel#NoModuleSettings`,
        },
      },
    },
  ],
};
