import { describe, expect, it } from "vitest";

import type { NativeNavConfig, NavItemRow } from "./native-nav";
import { APP_LOGO_ICON, resolveNativeIcon } from "./native-icons";
import {
  buildNativeMenu,
  filterNavForUser,
  mergeNativeNav,
  nativeNavConfigSchema,
  nativeNavVersion,
  tabSlotForPath,
} from "./native-nav";
import {
  loadNativeMenuForLaunch,
  readLastTabHrefs,
  recordFetchedNativeMenu,
  saveAppliedNativeMenu,
} from "./native-nav-store";

const nav = (key: string, extra: Partial<NavItemRow> = {}): NavItemRow => ({
  key,
  label: key,
  href: `/${key}`,
  platforms: ["web", "native"],
  enabled: true,
  ...extra,
});

describe("mergeNativeNav", () => {
  const navItems = [
    nav("home", { module: "dashboard", icon: "IconHome" }),
    nav("chat", { module: "chat", icon: "IconMessageCircle" }),
    nav("posts", { platforms: ["native"], href: "/content/posts" }),
    nav("web-only", { platforms: ["web"] }),
    nav("off", { enabled: false }),
    nav("billing", { module: "billing" }),
    nav("staff", { module: "chat", audience: "staff" }),
  ];
  const modules = [
    { slug: "dashboard" },
    { slug: "chat", accessCheck: "mod_chat_can_use" },
    { slug: "billing", enabled: false },
  ];

  it("keeps native, enabled rows of enabled modules in nav order by default", () => {
    const out = mergeNativeNav({ navItems, rows: [], modules });
    expect(out.items.map((i) => i.key)).toEqual([
      "home",
      "chat",
      "posts",
      "staff",
    ]);
    expect(out.tabCount).toBe(4);
  });

  it("applies the global's order, then appends rows it doesn't list", () => {
    const out = mergeNativeNav({
      navItems,
      rows: [
        { key: "posts" },
        { key: "gone" },
        { key: "home", hidden: true },
        { key: "posts" },
      ],
      modules,
      tabCount: "3",
    });
    expect(out.items.map((i) => [i.key, i.hidden])).toEqual([
      ["posts", false],
      ["home", true],
      ["chat", false],
      ["staff", false],
    ]);
    expect(out.tabCount).toBe(3);
  });

  it("resolves icons, audience and access checks", () => {
    const out = mergeNativeNav({
      navItems,
      rows: [{ key: "chat", sfSymbol: "message.fill" }],
      modules,
    });
    const chat = out.items.find((i) => i.key === "chat");
    expect(chat).toMatchObject({
      sf: "message.fill",
      md: "chat",
      module: "chat",
      accessCheck: "mod_chat_can_use",
      audience: "everyone",
    });
    expect(out.items.find((i) => i.key === "staff")?.audience).toBe("staff");
    expect(out.items.find((i) => i.key === "posts")).toMatchObject({
      sf: "newspaper.fill",
      md: "article",
      module: null,
    });
  });

  it("produces a config the client schema accepts, with a stable version", () => {
    const merged = mergeNativeNav({ navItems, rows: [], modules });
    const config: NativeNavConfig = {
      version: nativeNavVersion(merged),
      ...merged,
    };
    expect(nativeNavConfigSchema.parse(config)).toEqual(config);
    expect(nativeNavVersion(merged)).toBe(config.version);
    expect(nativeNavVersion({ ...merged, tabCount: 3 })).not.toBe(
      config.version,
    );
  });
});

describe("resolveNativeIcon", () => {
  it("prefers overrides, then the Tabler map, then href, then the default", () => {
    expect(resolveNativeIcon({ icon: "IconBell" })).toEqual({
      sf: "bell.fill",
      md: "notifications",
    });
    expect(
      resolveNativeIcon({ icon: "IconBell", materialIcon: " alarm " }),
    ).toEqual({ sf: "bell.fill", md: "alarm" });
    expect(resolveNativeIcon({ href: "/profile" }).md).toBe("account_circle");
    // The home screen wears the app logo, unless staff override it.
    expect(resolveNativeIcon({ href: "/home", icon: "IconHome" })).toEqual({
      sf: APP_LOGO_ICON,
      md: APP_LOGO_ICON,
    });
    expect(
      resolveNativeIcon({ href: "/home", sfSymbol: "house.fill" }).sf,
    ).toBe("house.fill");
    expect(resolveNativeIcon({ icon: "IconNope" })).toEqual({
      sf: "square.grid.2x2.fill",
      md: "apps",
    });
  });
});

describe("filterNavForUser / buildNativeMenu", () => {
  const config = mergeNativeNav({
    navItems: [
      nav("a"),
      nav("b", { module: "gated" }),
      nav("c", { audience: "staff" }),
      nav("d"),
      nav("e"),
      nav("f"),
      nav("g"),
    ],
    rows: [{ key: "d", hidden: true }],
    modules: [{ slug: "gated", accessCheck: "mod_gated_ok" }],
    tabCount: 3,
  });

  it("drops staff-only rows for members and rows of denied modules", () => {
    const rows = filterNavForUser(config.items, {
      isStaff: false,
      deniedModules: new Set(["gated"]),
    });
    expect(rows.map((r) => r.key)).toEqual(["d", "a", "e", "f", "g"]);
  });

  it("splits visible rows into tabs and More, skipping hidden + unknown screens", () => {
    const menu = buildNativeMenu(
      config,
      { isStaff: true, deniedModules: new Set() },
      new Set(["/a", "/b", "/c", "/d", "/e", "/g"]),
    );
    expect(menu.tabCount).toBe(3);
    expect(menu.tabs.map((t) => t.key)).toEqual(["a", "b", "c"]);
    expect(menu.more.map((t) => t.key)).toEqual(["e", "g"]);
  });

  it("finds the tab slot for a deep link path", () => {
    const menu = { tabs: [{ href: "/home" }, { href: "/a/chat" }] };
    expect(tabSlotForPath(menu, "/a/chat")).toBe(1);
    expect(tabSlotForPath(menu, "/a/chat/")).toBe(1);
    expect(tabSlotForPath(menu, "/a/chat?x=1")).toBe(1);
    expect(tabSlotForPath(menu, "/a/chat/123")).toBeUndefined();
  });
});

describe("native menu cache", () => {
  const memory = () => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k: string) => Promise.resolve(map.get(k) ?? null),
      setItem: (k: string, v: string) => {
        map.set(k, v);
        return Promise.resolve();
      },
    };
  };
  const menu = (label: string) => ({
    tabCount: 4 as const,
    tabs: [{ key: label, label, href: `/${label}`, sf: "x", md: "y" }],
    more: [],
  });

  it("returns null when nothing is cached, and the applied menu after", async () => {
    const s = memory();
    expect(await loadNativeMenuForLaunch(s, "k")).toBeNull();
    await saveAppliedNativeMenu(s, "k", menu("a"));
    expect(await loadNativeMenuForLaunch(s, "k")).toEqual(menu("a"));
    expect(await readLastTabHrefs(s)).toEqual(["/a"]);
  });

  it("keeps a different fetched menu pending until the next launch", async () => {
    const s = memory();
    await saveAppliedNativeMenu(s, "k", menu("a"));
    expect(await recordFetchedNativeMenu(s, "k", menu("a"), menu("a"))).toBe(
      false,
    );
    expect(await recordFetchedNativeMenu(s, "k", menu("a"), menu("b"))).toBe(
      true,
    );
    // Still on screen this session…
    expect(await readLastTabHrefs(s)).toEqual(["/a"]);
    // …applied on the next launch, and promoted to current.
    expect(await loadNativeMenuForLaunch(s, "k")).toEqual(menu("b"));
    expect(await loadNativeMenuForLaunch(s, "k")).toEqual(menu("b"));
    expect(await readLastTabHrefs(s)).toEqual(["/b"]);
  });

  it("ignores corrupt cache entries", async () => {
    const s = memory();
    s.map.set("k", "{not json");
    expect(await loadNativeMenuForLaunch(s, "k")).toBeNull();
    s.map.set("k", JSON.stringify({ v: 2, current: menu("a") }));
    expect(await loadNativeMenuForLaunch(s, "k")).toBeNull();
  });
});
