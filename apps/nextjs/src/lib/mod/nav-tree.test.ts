import { describe, expect, it } from "vitest";

import type { NavTreeRow } from "./nav-tree";
import {
  activeNavHref,
  buildNavTree,
  flattenNav,
  isNavHrefActive,
} from "./nav-tree";

const row = (
  id: number,
  key: string,
  extra: Partial<NavTreeRow> = {},
): NavTreeRow => ({ id, key, label: key, href: `/a/${key}`, ...extra });

describe("buildNavTree", () => {
  it("nests rows under their parent in menu order, one level deep", () => {
    const tree = buildNavTree([
      row(1, "home"),
      row(2, "crm", { icon: "IconBriefcase" }),
      row(3, "leads", { parent: 2 }),
      row(4, "chat"),
      // Populated parent (depth 1) works the same as an id.
      row(5, "cases", { parent: { id: 2 } }),
    ]);
    expect(tree).toEqual([
      { key: "home", label: "home", href: "/a/home", icon: undefined },
      {
        key: "crm",
        label: "crm",
        href: "/a/crm",
        icon: "IconBriefcase",
        items: [
          { key: "leads", label: "leads", href: "/a/leads", icon: undefined },
          { key: "cases", label: "cases", href: "/a/cases", icon: undefined },
        ],
      },
      { key: "chat", label: "chat", href: "/a/chat", icon: undefined },
    ]);
  });

  it("hides rows whose group isn't visible, and drops empty groups", () => {
    const tree = buildNavTree([
      // Parent 9 was filtered out (turned off, or hidden for this user).
      row(1, "orphan", { parent: 9 }),
      row(2, "empty-group", { kind: "group", href: null }),
      row(3, "nested", { parent: 4 }),
      row(4, "child", { parent: 5 }),
      row(5, "top"),
    ]);
    // "child" sits under "top"; "nested" sits under a nested row: hidden.
    expect(tree.map((i) => i.key)).toEqual(["top"]);
    expect(tree[0]?.items?.map((i) => i.key)).toEqual(["child"]);
  });

  it("keeps a staff-made group (no link) once it has items", () => {
    const tree = buildNavTree([
      row(1, "group:x", { kind: "group", href: null, label: "Support" }),
      row(2, "inbox", { parent: 1 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ label: "Support", href: "" });
    expect(tree[0]?.items?.[0]?.href).toBe("/a/inbox");
  });
});

describe("flattenNav / isNavHrefActive", () => {
  it("lists every link, a group's own href and its items included", () => {
    const flat = flattenNav([
      { key: "home", label: "Home", href: "/a" },
      {
        key: "crm",
        label: "CRM",
        href: "/a/crm",
        items: [{ key: "leads", label: "Leads", href: "/a/crm/leads" }],
      },
      {
        key: "group:x",
        label: "Group",
        href: "",
        items: [{ key: "inbox", label: "Inbox", href: "/a/inbox" }],
      },
    ]);
    expect(flat.map((i) => i.href)).toEqual([
      "/a",
      "/a/crm",
      "/a/crm/leads",
      "/a/inbox",
    ]);
    expect(flat.every((i) => !("items" in i))).toBe(true);
  });

  it("picks the longest matching href, so /a doesn't win every page", () => {
    const hrefs = ["/a", "/a/crm", "/a/crm/cases", ""];
    expect(activeNavHref(hrefs, "/a/crm/cases/12")).toBe("/a/crm/cases");
    expect(activeNavHref(hrefs, "/a/crm")).toBe("/a/crm");
    expect(activeNavHref(hrefs, "/a")).toBe("/a");
    expect(activeNavHref(hrefs, "/billing")).toBeUndefined();
  });

  it("matches the href and pages under it, never an empty href", () => {
    expect(isNavHrefActive("/a/crm/cases", "/a/crm/cases/12")).toBe(true);
    expect(isNavHrefActive("/a/crm/cases", "/a/crm/casesx")).toBe(false);
    expect(isNavHrefActive("", "/a")).toBe(false);
  });
});
