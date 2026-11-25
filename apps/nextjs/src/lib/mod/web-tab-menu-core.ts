import type { NativeNavConfig, NavUserContext } from "@acme/app";
import { buildNativeMenu, NATIVE_PROFILE_HREF } from "@acme/app";

import type { NavMenuItem } from "./nav-types";

/**
 * Pure logic behind the web bottom tab bar (lib/mod/web-tab-menu.ts →
 * components/glass-tab-bar.tsx). Client-safe and dependency-free so it's
 * unit-tested in node.
 */

export interface WebTabMenu {
  /** The first `tabCount` visible rows. */
  tabs: NavMenuItem[];
  /** Every visible row (tabs first), plus Profile — the Search sheet's list. */
  all: NavMenuItem[];
}

/** Fallback Tabler icons for rows without one (core Posts / Profile). */
const HREF_ICONS: Record<string, string> = {
  "/a": "IconHome",
  "/posts": "IconNews",
  "/events": "IconCalendar",
  "/profile": "IconUser",
};

const PROFILE_ENTRY: NavMenuItem = {
  key: "core:/profile",
  label: "Profile",
  href: NATIVE_PROFILE_HREF,
  icon: "IconUser",
};

/** Pure core of `getWebTabMenu` (unit-tested). */
export function buildWebTabMenu(
  config: Pick<NativeNavConfig, "tabCount" | "items">,
  icons: ReadonlyMap<string, string | undefined>,
  user: NavUserContext,
  webDefaults: readonly { module: string; href: string }[],
): WebTabMenu {
  const items = config.items.map((item) => ({
    ...item,
    href: webHrefFor(item, webDefaults),
  }));
  const menu = buildNativeMenu({ tabCount: config.tabCount, items }, user);
  const toEntry = (e: {
    key: string;
    label: string;
    href: string;
  }): NavMenuItem => ({
    key: e.key,
    label: e.label,
    href: e.href,
    icon: icons.get(e.key) ?? HREF_ICONS[e.href],
  });
  const tabs = menu.tabs.map(toEntry);
  const all = [...tabs, ...menu.more.map(toEntry)];
  // Profile holds sign out, so the Search sheet always lists it (as native).
  if (!all.some((e) => e.href === NATIVE_PROFILE_HREF)) all.push(PROFILE_ENTRY);
  return { tabs, all };
}

/**
 * The web page for a native menu row. Core rows share one path on both
 * platforms, except native content screens (`/content/posts`), which are the
 * public site's pages on the web (`/posts`). A module row keeps its href when
 * the module has a web page there; otherwise it opens the module's (first)
 * web nav entry.
 */
export function webHrefFor(
  item: { href: string; module: string | null },
  webDefaults: readonly { module: string; href: string }[],
): string {
  if (!item.module) return item.href.replace(/^\/content(?=\/)/, "");
  const own = webDefaults.filter((d) => d.module === item.module);
  if (own.length === 0 || own.some((d) => d.href === item.href))
    return item.href;
  return own[0]?.href ?? item.href;
}

/** The menu entry for `pathname`: longest matching href wins. */
export function activeHref(
  items: { href: string }[],
  pathname: string,
): string | undefined {
  return items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
