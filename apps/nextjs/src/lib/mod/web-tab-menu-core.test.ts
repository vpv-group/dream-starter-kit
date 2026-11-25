import { describe, expect, it } from "vitest";

import type { NativeNavItem } from "@acme/app";

import { activeHref, buildWebTabMenu, webHrefFor } from "./web-tab-menu-core";

const WEB_DEFAULTS = [
  { module: "dashboard", href: "/a" },
  { module: "chat", href: "/a/chat" },
  { module: "billing", href: "/billing" },
  { module: "reminders", href: "/a/reminders" },
];

function item(over: Partial<NativeNavItem> & { key: string }): NativeNavItem {
  return {
    label: over.key,
    href: `/${over.key}`,
    sf: "circle",
    md: "circle",
    hidden: false,
    audience: "everyone",
    module: null,
    accessCheck: null,
    ...over,
  };
}

const user = { isStaff: false, deniedModules: new Set<string>() };

describe("webHrefFor", () => {
  it("maps a module's native-only path to its web page", () => {
    expect(
      webHrefFor({ href: "/home", module: "dashboard" }, WEB_DEFAULTS),
    ).toBe("/a");
    expect(
      webHrefFor({ href: "/a/billing", module: "billing" }, WEB_DEFAULTS),
    ).toBe("/billing");
  });

  it("keeps hrefs the web shares", () => {
    expect(webHrefFor({ href: "/a/chat", module: "chat" }, WEB_DEFAULTS)).toBe(
      "/a/chat",
    );
    expect(webHrefFor({ href: "/profile", module: null }, WEB_DEFAULTS)).toBe(
      "/profile",
    );
    // A module with no web nav entry keeps its href.
    expect(webHrefFor({ href: "/x", module: "other" }, WEB_DEFAULTS)).toBe(
      "/x",
    );
  });

  it("maps native content screens to the public pages", () => {
    expect(
      webHrefFor({ href: "/content/posts", module: null }, WEB_DEFAULTS),
    ).toBe("/posts");
  });
});

describe("buildWebTabMenu", () => {
  const config = {
    tabCount: 3 as const,
    items: [
      item({ key: "home", href: "/home", module: "dashboard" }),
      item({ key: "posts", href: "/content/posts" }),
      item({ key: "admin", audience: "staff" }),
      item({ key: "chat", href: "/a/chat", module: "chat" }),
      item({ key: "remind", href: "/a/reminders", hidden: true }),
      item({ key: "bill", href: "/a/billing", module: "billing" }),
    ],
  };
  const icons = new Map([
    ["home", "IconHome"],
    ["chat", "IconMessageCircle"],
  ]);

  it("uses the native order, tab count, hidden + audience rules", () => {
    const menu = buildWebTabMenu(config, icons, user, WEB_DEFAULTS);
    expect(menu.tabs.map((t) => t.href)).toEqual(["/a", "/posts", "/a/chat"]);
    expect(menu.all.map((t) => t.href)).toEqual([
      "/a",
      "/posts",
      "/a/chat",
      "/billing",
      "/profile",
    ]);
    expect(menu.tabs.map((t) => t.icon)).toEqual([
      "IconHome",
      "IconNews",
      "IconMessageCircle",
    ]);
  });

  it("shows staff rows to staff and drops denied modules", () => {
    const menu = buildWebTabMenu(
      config,
      icons,
      { isStaff: true, deniedModules: new Set(["chat"]) },
      WEB_DEFAULTS,
    );
    expect(menu.tabs.map((t) => t.key)).toEqual(["home", "posts", "admin"]);
    expect(menu.all.some((t) => t.key === "chat")).toBe(false);
  });
});

describe("activeHref", () => {
  const items = [
    { href: "/a" },
    { href: "/a/chat" },
    { href: "/a/notifications" },
  ];

  it("picks the longest matching href", () => {
    expect(activeHref(items, "/a")).toBe("/a");
    expect(activeHref(items, "/a/chat/123")).toBe("/a/chat");
    expect(activeHref(items, "/a/notifications")).toBe("/a/notifications");
    expect(activeHref(items, "/profile")).toBeUndefined();
  });
});
