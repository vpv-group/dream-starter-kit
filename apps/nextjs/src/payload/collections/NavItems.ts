import type {
  CollectionConfig,
  RelationshipFieldSingleValidation,
  TextFieldSingleValidation,
  Where,
} from "payload";

import { anyone, isStaff } from "../access";

const COMPONENTS = "~/payload/components/navigation";

const kindOf = (siblingData: unknown): string | undefined =>
  (siblingData as { kind?: string } | undefined)?.kind;

/** Groups have no link of their own; every other row needs one. */
const validateHref: TextFieldSingleValidation = (value, { siblingData }) =>
  kindOf(siblingData) === "group" ||
  Boolean(value) ||
  "A link row needs an href.";

/** One level deep: a group's items can't hold items, and groups never nest. */
const validateParent: RelationshipFieldSingleValidation = async (
  value,
  { req, id, siblingData },
) => {
  if (value == null) return true;
  if (kindOf(siblingData) === "group")
    return "A group can't sit inside another group.";
  // An id from the admin form; tolerate a populated row or a
  // `{ relationTo, value }` pair from API callers.
  const parentId =
    typeof value === "object"
      ? "value" in value
        ? value.value
        : (value as { id: number | string }).id
      : value;
  if (parentId === id) return "A row can't be its own group.";
  const parent = await req.payload.findByID({
    collection: "nav-items",
    id: parentId,
    depth: 0,
    overrideAccess: true,
    req,
  });
  if (parent.kind !== "group")
    return `"${parent.label}" isn't a group. Make one with Create New.`;
  if (id !== undefined) {
    const children = await req.payload.count({
      collection: "nav-items",
      where: { parent: { equals: id } },
      overrideAccess: true,
      req,
    });
    if (children.totalDocs > 0)
      return "Items are listed under this one. Move them out first.";
  }
  return true;
};

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
 *
 * Groups (web sidebar only): a row with `parent` set is listed under that row
 * as a collapsible submenu, one level deep. A module can ship a group (its
 * manifest nav `children`), and staff can create their own: "Create New"
 * makes a `kind: "group"` row (a label + icon, no link), and only those rows
 * can be deleted. The native menu ignores `parent`.
 */
export const NavItems: CollectionConfig = {
  slug: "nav-items",
  labels: { singular: "Navigation item", plural: "Navigation" },
  orderable: true,
  admin: {
    group: "Modules",
    useAsTitle: "label",
    defaultColumns: ["label", "parent", "href", "platforms", "enabled"],
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
    // Staff create menu groups only (the hook below forces kind "group");
    // link rows come from the boot reconcile, which bypasses access.
    create: isStaff,
    // Only staff-made groups (no module) can be deleted. Module and core
    // rows would come back on the next boot anyway; turn those off instead.
    delete: (args): boolean | Where =>
      isStaff(args)
        ? {
            and: [{ kind: { equals: "group" } }, { module: { exists: false } }],
          }
        : false,
  },
  hooks: {
    beforeValidate: [
      ({ data, operation, context }) => {
        if (operation !== "create" || !data || context.navReconcile)
          return data;
        // A row created from /admin (or the REST API) is always a group:
        // a label and icon that other web rows can sit under.
        return {
          ...data,
          kind: "group",
          key: `group:${crypto.randomUUID()}`,
          href: null,
          module: null,
          parent: null,
          platforms: ["web"],
        };
      },
    ],
  },
  fields: [
    {
      name: "kind",
      type: "select",
      defaultValue: "link",
      options: [
        { label: "Link", value: "link" },
        { label: "Group", value: "group" },
      ],
      admin: { readOnly: true, hidden: true },
    },
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
        // Hidden while creating, and on groups made here (keyed "group:…").
        condition: (data) =>
          typeof data.key === "string" && !data.key.startsWith("group:"),
      },
    },
    { name: "label", type: "text", required: true },
    {
      name: "href",
      type: "text",
      // Groups have no link of their own; every other row needs one.
      validate: validateHref,
      admin: {
        readOnly: true,
        condition: (data) => Boolean(data.href),
      },
    },
    {
      name: "parent",
      label: "Group",
      type: "relationship",
      relationTo: "nav-items",
      // Only groups hold items: ones made here, and module groups (e.g.
      // CRM). One level deep, so a group never sits inside another.
      filterOptions: ({ id }): Where => {
        const and: Where[] = [{ kind: { equals: "group" } }];
        if (id) and.push({ id: { not_equals: id } });
        return { and };
      },
      validate: validateParent,
      admin: {
        position: "sidebar",
        description:
          "Web sidebar only: list this item in that group's collapsible submenu. Leave empty for a top-level item. Make a new group with Create New.",
        condition: (data) => Boolean(data.key) && data.kind !== "group",
      },
    },
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
      // Groups are web-only (the native menu is flat).
      admin: {
        condition: (data) => Boolean(data.key) && data.kind !== "group",
      },
    },
    {
      name: "audience",
      type: "select",
      defaultValue: "everyone",
      options: [
        { label: "Everyone signed in", value: "everyone" },
        { label: "Staff only", value: "staff" },
        { label: "Non-staff only (members, clients)", value: "members" },
      ],
      admin: {
        description:
          "Staff only = shown only to users with staff access (profiles.is_staff). Non-staff only = hidden from staff (e.g. a client portal's own pages). Applies on web and native. A module can also hide its entries for users it doesn't allow (its own access setting).",
      },
    },
    { name: "enabled", type: "checkbox", defaultValue: true },
  ],
};
