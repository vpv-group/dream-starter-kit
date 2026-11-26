import type { NavMenuItem } from "./nav-types";

/**
 * Pure helpers that turn the flat `nav-items` rows into the web sidebar's
 * one-level tree (docs/CMS.md → nav-items → Groups), and back.
 */

/** A `nav-items` row that already passed the per-user filters, in menu order. */
export interface NavTreeRow {
  id: number | string;
  key: string;
  label: string;
  href?: string | null;
  icon?: string | null;
  /** "group" for a staff-made heading with no link of its own. */
  kind?: string | null;
  /** The row it's listed under: an id, or the populated row (depth ≥ 1). */
  parent?: number | string | { id: number | string } | null;
}

const parentIdOf = (row: NavTreeRow): number | string | null =>
  row.parent == null
    ? null
    : typeof row.parent === "object"
      ? row.parent.id
      : row.parent;

/**
 * Nest visible rows under their visible parent, keeping menu order.
 *
 * - A row whose parent isn't visible (turned off, hidden for this user, its
 *   module denied) is hidden too: turning a group off hides its submenu.
 * - A row listed under a row that is itself nested is hidden (groups are one
 *   level deep; the admin validation prevents this, so it's only a guard).
 * - A staff-made group with no visible items is dropped (it has no link);
 *   a module group whose items are all off falls back to its own link.
 */
export function buildNavTree(rows: readonly NavTreeRow[]): NavMenuItem[] {
  const visible = new Map(rows.map((r) => [String(r.id), r]));
  const topLevel = rows.filter((r) => parentIdOf(r) === null);
  const childrenOf = new Map<string, NavTreeRow[]>();
  for (const row of rows) {
    const parentId = parentIdOf(row);
    if (parentId === null) continue;
    const parent = visible.get(String(parentId));
    if (!parent || parentIdOf(parent) !== null || !row.href) continue;
    const list = childrenOf.get(String(parentId)) ?? [];
    list.push(row);
    childrenOf.set(String(parentId), list);
  }

  const out: NavMenuItem[] = [];
  for (const row of topLevel) {
    const children = childrenOf.get(String(row.id)) ?? [];
    const item: NavMenuItem = {
      key: row.key,
      label: row.label,
      href: row.href ?? "",
      icon: row.icon ?? undefined,
    };
    if (children.length > 0) {
      item.items = children.map((c) => ({
        key: c.key,
        label: c.label,
        href: c.href ?? "",
        icon: c.icon ?? undefined,
      }));
    } else if (!row.href) {
      // A staff-made group with no visible items has nowhere to link.
      continue;
    }
    out.push(item);
  }
  return out;
}

/**
 * Every linkable entry, groups' children included, for consumers that match
 * the current path against the menu (page title, tab-bar active state).
 */
export function flattenNav(items: readonly NavMenuItem[]): NavMenuItem[] {
  return items.flatMap((item) => [
    ...(item.href
      ? [{ key: item.key, label: item.label, href: item.href, icon: item.icon }]
      : []),
    ...(item.items ?? []),
  ]);
}

/** Is `pathname` this href or a page under it? */
export function isNavHrefActive(href: string, pathname: string): boolean {
  return href !== "" && (pathname === href || pathname.startsWith(`${href}/`));
}

/**
 * The one menu href the current page belongs to: the longest href that is
 * the path or a prefix of it. So `/a/crm/cases/1` marks Cases, not the
 * Dashboard at `/a` that prefixes every app page.
 */
export function activeNavHref(
  hrefs: readonly string[],
  pathname: string,
): string | undefined {
  return hrefs
    .filter((href) => isNavHrefActive(href, pathname))
    .sort((a, b) => b.length - a.length)[0];
}
