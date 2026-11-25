import { z } from "zod";

import { resolveNativeIcon } from "./native-icons";

/**
 * Native (iOS + Android) app menu — shape and pure logic shared by the server
 * resolver (apps/nextjs/src/lib/mod/native-nav.ts → GET /api/nav/native) and
 * the Expo app (useNativeNav).
 *
 * Staff configure it on /admin → Navigation → "iOS and Android App": the
 * native rows of the `nav-items` collection, in an order of their own, with a
 * 3- or 4-tab bar and per-item "hide on native". The first `tabCount` visible
 * items are tabs; the rest are listed in the More / Search screen. Hidden
 * items stay reachable by deep link only.
 */

export const NATIVE_TAB_COUNTS = [3, 4] as const;
export type NativeTabCount = (typeof NATIVE_TAB_COUNTS)[number];
export const DEFAULT_NATIVE_TAB_COUNT: NativeTabCount = 4;

/** The href of the account screen, always reachable from More → Account. */
export const NATIVE_PROFILE_HREF = "/profile";

export const nativeNavItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  href: z.string(),
  sf: z.string(),
  md: z.string(),
  hidden: z.boolean(),
  audience: z.enum(["everyone", "staff"]),
  /** Owning module slug; null for core entries. */
  module: z.string().nullable(),
  /** The module's access check (SQL function), evaluated per user. */
  accessCheck: z.string().nullable(),
});
export type NativeNavItem = z.infer<typeof nativeNavItemSchema>;

export const nativeNavConfigSchema = z.object({
  version: z.string(),
  tabCount: z.union([z.literal(3), z.literal(4)]),
  items: z.array(nativeNavItemSchema),
});
export type NativeNavConfig = z.infer<typeof nativeNavConfigSchema>;

/** A rendered menu entry (per user, after filtering). */
export interface NativeMenuEntry {
  key: string;
  label: string;
  href: string;
  sf: string;
  md: string;
}

/** The per-user menu the app renders: tab bar + More / Search list. */
export interface NativeMenu {
  tabCount: NativeTabCount;
  tabs: NativeMenuEntry[];
  more: NativeMenuEntry[];
}

// ---------------------------------------------------------------------------
// Server side: merge nav-items + the native-navigation global
// ---------------------------------------------------------------------------

/** A `nav-items` row, reduced to what the native menu needs. */
export interface NavItemRow {
  key: string;
  label: string;
  href: string;
  icon?: string | null;
  platforms?: string[] | null;
  audience?: string | null;
  enabled?: boolean | null;
  /** Owning module slug (undefined/null for core rows). */
  module?: string | null;
}

/** A row of the `native-navigation` global's `items` array. */
export interface NativeNavRow {
  /** The nav item's `key` (resolved from the relationship). */
  key: string;
  hidden?: boolean | null;
  sfSymbol?: string | null;
  materialIcon?: string | null;
}

export interface ModuleRow {
  slug: string;
  enabled?: boolean | null;
  accessCheck?: string | null;
}

/**
 * Merge the published `native-navigation` global with the live menu rows:
 * native, enabled rows of enabled modules, in the global's order. Rows the
 * global doesn't list yet (a newly installed module) go at the end, visible —
 * so the menu needs no reconcile step. Rows the global lists that no longer
 * exist are dropped.
 */
export function mergeNativeNav(input: {
  navItems: NavItemRow[];
  rows: NativeNavRow[];
  modules: ModuleRow[];
  /** The global's select value ("3" / "4"); anything else → the default. */
  tabCount?: number | string | null;
}): Omit<NativeNavConfig, "version"> {
  const modBySlug = new Map(input.modules.map((m) => [m.slug, m]));
  const live = input.navItems.filter((n) => {
    if (n.enabled === false) return false;
    if (!(n.platforms ?? []).includes("native")) return false;
    if (!n.module) return true;
    const mod = modBySlug.get(n.module);
    return !!mod && mod.enabled !== false;
  });
  const liveByKey = new Map(live.map((n) => [n.key, n]));

  const ordered: { nav: NavItemRow; row?: NativeNavRow }[] = [];
  const seen = new Set<string>();
  for (const row of input.rows) {
    const nav = liveByKey.get(row.key);
    if (!nav || seen.has(row.key)) continue;
    seen.add(row.key);
    ordered.push({ nav, row });
  }
  for (const nav of live) {
    if (!seen.has(nav.key)) ordered.push({ nav });
  }

  return {
    tabCount: normalizeTabCount(input.tabCount),
    items: ordered.map(({ nav, row }) => {
      const icon = resolveNativeIcon({
        icon: nav.icon,
        href: nav.href,
        sfSymbol: row?.sfSymbol,
        materialIcon: row?.materialIcon,
      });
      return {
        key: nav.key,
        label: nav.label,
        href: nav.href,
        sf: icon.sf,
        md: icon.md,
        hidden: row?.hidden === true,
        audience: nav.audience === "staff" ? "staff" : "everyone",
        module: nav.module ?? null,
        accessCheck: nav.module
          ? (modBySlug.get(nav.module)?.accessCheck ?? null)
          : null,
      };
    }),
  };
}

export function normalizeTabCount(value: unknown): NativeTabCount {
  const n = typeof value === "string" ? Number(value) : value;
  return n === 3 || n === 4 ? n : DEFAULT_NATIVE_TAB_COUNT;
}

/** Stable short hash of the config (FNV-1a) — the `version` clients compare. */
export function nativeNavVersion(
  config: Omit<NativeNavConfig, "version">,
): string {
  const text = JSON.stringify(config);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Client side: per-user menu
// ---------------------------------------------------------------------------

export interface NavUserContext {
  isStaff: boolean;
  /** Module slugs whose access check denies this user. */
  deniedModules: ReadonlySet<string>;
}

/**
 * Per-user visibility shared by web and native menus: "Staff only" rows need
 * staff, and a module's rows need its access check to pass.
 */
export function filterNavForUser<
  T extends { audience?: string | null; module?: string | null },
>(items: T[], user: NavUserContext): T[] {
  return items
    .filter((d) => user.isStaff || d.audience !== "staff")
    .filter((d) => !d.module || !user.deniedModules.has(d.module));
}

/**
 * The menu one user sees: drop hidden rows, rows they may not see, and rows
 * whose screen isn't compiled into this build (`availableHrefs` — a config
 * can only point at screens the installed app ships). The first `tabCount`
 * remaining rows are tabs; the rest go to More / Search.
 */
export function buildNativeMenu(
  config: Pick<NativeNavConfig, "tabCount" | "items">,
  user: NavUserContext,
  availableHrefs?: ReadonlySet<string>,
): NativeMenu {
  const visible = filterNavForUser(
    config.items.filter((i) => !i.hidden),
    user,
  ).filter((i) => !availableHrefs || availableHrefs.has(i.href));
  const entries = visible.map(({ key, label, href, sf, md }) => ({
    key,
    label,
    href,
    sf,
    md,
  }));
  const tabCount = normalizeTabCount(config.tabCount);
  return {
    tabCount,
    tabs: entries.slice(0, tabCount),
    more: entries.slice(tabCount),
  };
}

/** Do two menus render identically? (decides whether a refresh is pending) */
export function sameNativeMenu(a: NativeMenu, b: NativeMenu): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Which tab slot (0-based) shows `path`, if any — used to route deep links to
 * a module that lives in the tab bar into its tab instead of pushing a copy.
 */
export function tabSlotForPath(
  menu: { tabs: { href: string }[] },
  path: string,
): number | undefined {
  const trim = (p: string) => {
    const out = p.replace(/\/+$/, "");
    return out === "" ? "/" : out;
  };
  const clean = trim(path.split(/[?#]/)[0] ?? "");
  const i = menu.tabs.findIndex((t) => trim(t.href) === clean);
  return i === -1 ? undefined : i;
}
