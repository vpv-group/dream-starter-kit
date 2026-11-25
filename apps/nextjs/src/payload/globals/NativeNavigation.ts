import type { GlobalConfig } from "payload";

import { isStaff, publishedOrStaff } from "../access";

/**
 * The iOS + Android app menu: which native menu rows (`nav-items` with the
 * native platform) go in the tab bar, in what order, and which are hidden.
 * The first `tabCount` visible rows are tabs; the rest are listed on the
 * More / Search screen; hidden rows are reachable only by deep link.
 *
 * Edited only from /admin → Navigation ("iOS and Android App" section,
 * payload/components/navigation/NativeNavigationEditor.tsx), so it's hidden
 * from the admin nav (and has no standalone admin page).
 * Drafts → publish: the app reads only the PUBLISHED version
 * (lib/mod/native-nav.ts → GET /api/nav/native), so a half-finished reorder
 * never ships. Rows a new module adds that aren't listed here yet appear at
 * the end, visible.
 */
export const NativeNavigation: GlobalConfig = {
  slug: "native-navigation",
  label: "Native navigation",
  admin: {
    group: "Modules",
    hidden: true,
    description:
      "The iOS and Android app tab bar. Edit it from Navigation → iOS and Android App.",
  },
  versions: { drafts: true, max: 20 },
  access: { read: publishedOrStaff, update: isStaff, readVersions: isStaff },
  fields: [
    {
      name: "tabCount",
      type: "select",
      required: true,
      defaultValue: "4",
      options: [
        { label: "3 tabs", value: "3" },
        { label: "4 tabs", value: "4" },
      ],
      admin: {
        description:
          "How many menu items show in the bottom tab bar. The rest are listed under More (Android) / Search (iOS).",
      },
    },
    {
      name: "items",
      type: "array",
      admin: { description: "Order = tab bar order, then the More list." },
      fields: [
        {
          name: "item",
          type: "relationship",
          relationTo: "nav-items",
          required: true,
          filterOptions: { platforms: { in: ["native"] } },
        },
        {
          name: "hidden",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description:
              "Hide from the tab bar and More menu. The screen stays reachable by deep link.",
          },
        },
        {
          name: "sfSymbol",
          type: "text",
          admin: {
            description:
              "iOS icon override — an SF Symbol name (e.g. bell.fill).",
          },
        },
        {
          name: "materialIcon",
          type: "text",
          admin: {
            description:
              "Android icon override — a Material Symbols name (e.g. notifications).",
          },
        },
      ],
    },
  ],
};
