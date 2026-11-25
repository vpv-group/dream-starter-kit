import type { CollectionConfig } from "payload";

import { anyone, isStaff } from "../access";

const COMPONENTS = "~/payload/components/navigation";

/**
 * The CMS-driven app menu (docs/MODULES-PLAN.md §2.5) — one row per menu
 * entry, core entries included, so staff rename / drag-reorder / re-icon /
 * toggle the WHOLE menu uniformly from /admin without a deploy.
 *
 * Rows are created/deleted only by the boot-time reconcile
 * (lib/mod/reconcile-nav.ts) from the manifest nav defaults; label/icon/
 * platforms/enabled/order are staff-owned after creation and never
 * overwritten by reconcile or module updates.
 *
 * Shown in /admin as "Navigation": the list table is the WEB app menu (rows
 * with the web platform — the /a sidebar), and below it the "iOS and Android
 * App" section edits the native tab bar from the native rows, ordered and
 * hidden independently (the `native-navigation` global —
 * payload/components/navigation/NativeNavigationEditor.tsx).
 *
 * Public read: the native app renders its menu from these rows + that global
 * (GET /api/nav/native → `useNativeNav()` in @acme/app).
 */
export const NavItems: CollectionConfig = {
  slug: "nav-items",
  labels: { singular: "Navigation item", plural: "Navigation" },
  orderable: true,
  admin: {
    group: "Modules",
    useAsTitle: "label",
    defaultColumns: ["label", "href", "platforms", "enabled"],
    description:
      "The app menus. New modules add their entries here automatically on install.",
    // The table is the web app menu; native-only rows are managed in the
    // "iOS and Android App" section below it.
    baseFilter: () => ({ platforms: { in: ["web"] } }),
    components: {
      beforeListTable: [`${COMPONENTS}/WebAppHeader#WebAppHeader`],
      afterList: [
        `${COMPONENTS}/NativeNavigationEditor#NativeNavigationEditor`,
      ],
    },
  },
  access: {
    read: anyone,
    update: isStaff,
    create: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: "key",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true, hidden: true },
    },
    {
      name: "module",
      type: "relationship",
      relationTo: "kit-modules",
      admin: {
        readOnly: true,
        position: "sidebar",
        description: "Empty for core entries.",
      },
    },
    { name: "label", type: "text", required: true },
    { name: "href", type: "text", required: true, admin: { readOnly: true } },
    {
      name: "icon",
      type: "text",
      admin: {
        description:
          "Icon name from the kit's icon map (e.g. IconMessageCircle). Unknown names fall back to a default icon.",
      },
    },
    {
      name: "platforms",
      type: "select",
      hasMany: true,
      options: [
        { label: "Web", value: "web" },
        { label: "Native", value: "native" },
      ],
      defaultValue: ["web", "native"],
    },
    {
      name: "audience",
      type: "select",
      defaultValue: "everyone",
      options: [
        { label: "Everyone signed in", value: "everyone" },
        { label: "Staff only", value: "staff" },
      ],
      admin: {
        description:
          "Staff only = shown only to users with staff access (profiles.is_staff), on web and native. A module can also hide its entries for users it doesn't allow (its own access setting).",
      },
    },
    { name: "enabled", type: "checkbox", defaultValue: true },
  ],
};
