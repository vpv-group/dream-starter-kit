import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";

import { desiredNavItems, reconcileModules } from "./reconcile-nav";

// A CRM-like module with a web submenu, independent of what's installed.
vi.mock("~/mod/registry.data.generated", () => ({
  modInstalled: [{ slug: "crm", name: "CRM", version: "1.3.0", system: false }],
  modNavDefaults: {
    web: [
      {
        key: "mod:crm:/a/crm",
        module: "crm",
        title: "CRM",
        href: "/a/crm",
        order: 20,
      },
      {
        key: "mod:crm:/a/crm/leads",
        module: "crm",
        title: "Leads",
        href: "/a/crm/leads",
        order: 20.01,
        parent: "mod:crm:/a/crm",
      },
      {
        key: "mod:crm:/a/crm/cases",
        module: "crm",
        title: "Cases",
        href: "/a/crm/cases",
        order: 20.02,
        audience: "members",
        parent: "mod:crm:/a/crm",
      },
    ],
    native: [
      {
        key: "mod:crm:/a/crm",
        module: "crm",
        title: "CRM",
        href: "/a/crm",
        order: 20,
      },
    ],
  },
}));
vi.mock("~/mod/registry.payload.generated", () => ({ modSettings: {} }));

interface Row {
  id: number;
  key?: string;
  slug?: string;
  kind?: string;
  [field: string]: unknown;
}

/** An in-memory Payload with just what the reconcile calls. */
function fakePayload(seed: Record<string, Row[]> = {}) {
  const db: Record<string, Row[]> = {
    "kit-modules": [],
    "nav-items": [],
    ...seed,
  };
  let nextId = 100;
  const payload = {
    find: vi.fn(({ collection }: { collection: string }) =>
      Promise.resolve({ docs: [...(db[collection] ?? [])] }),
    ),
    create: vi.fn(({ collection, data }: { collection: string; data: Row }) => {
      const row = { ...data, id: nextId++ };
      (db[collection] ??= []).push(row);
      return Promise.resolve(row);
    }),
    update: vi.fn(
      ({
        collection,
        id,
        data,
      }: {
        collection: string;
        id: number;
        data: Row;
      }) => {
        const row = db[collection]?.find((r) => r.id === id);
        Object.assign(row ?? {}, data);
        return Promise.resolve(row);
      },
    ),
    delete: vi.fn(({ collection, id }: { collection: string; id: number }) => {
      db[collection] = (db[collection] ?? []).filter((r) => r.id !== id);
      return Promise.resolve({});
    }),
    findGlobal: vi.fn(() => Promise.resolve({})),
    logger: { debug: vi.fn() },
  } as unknown as Payload;
  return { payload, db };
}

const navRow = (db: Record<string, Row[]>, key: string) =>
  db["nav-items"]?.find((r) => r.key === key);

describe("desiredNavItems", () => {
  it("sorts a submenu right after its parent and carries the parent key", () => {
    const keys = desiredNavItems().map((d) => [d.key, d.parentKey]);
    const crm = keys.findIndex(([k]) => k === "mod:crm:/a/crm");
    expect(keys.slice(crm, crm + 3)).toEqual([
      ["mod:crm:/a/crm", undefined],
      ["mod:crm:/a/crm/leads", "mod:crm:/a/crm"],
      ["mod:crm:/a/crm/cases", "mod:crm:/a/crm"],
    ]);
  });
});

describe("reconcileModules: nav groups", () => {
  it("creates submenu rows under their parent, flagged as framework rows", async () => {
    const { payload, db } = fakePayload();
    await reconcileModules(payload);
    const crm = navRow(db, "mod:crm:/a/crm");
    expect(crm).toMatchObject({ kind: "group", platforms: ["web", "native"] });
    expect(navRow(db, "mod:crm:/a/crm/leads")).toMatchObject({
      parent: crm?.id,
      platforms: ["web"],
      audience: "everyone",
    });
    expect(navRow(db, "mod:crm:/a/crm/cases")).toMatchObject({
      parent: crm?.id,
      audience: "members",
    });
    // The collection hook turns staff creates into groups unless told
    // the row comes from the reconcile.
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "nav-items",
        context: { navReconcile: true },
      }),
    );
  });

  it("puts new items under an existing parent row (a module update adds a submenu)", async () => {
    const { payload, db } = fakePayload({
      "nav-items": [{ id: 7, key: "mod:crm:/a/crm", label: "Sales" }],
    });
    await reconcileModules(payload);
    expect(navRow(db, "mod:crm:/a/crm/leads")?.parent).toBe(7);
    // The parent becomes a group; its staff-owned fields are left alone.
    expect(navRow(db, "mod:crm:/a/crm")).toMatchObject({
      kind: "group",
      label: "Sales",
    });
  });

  it("keeps staff-made groups and still removes stale framework rows", async () => {
    const { payload, db } = fakePayload({
      "nav-items": [
        { id: 1, key: "group:abc", kind: "group", label: "Support" },
        { id: 2, key: "mod:gone:/a/gone", kind: "link", label: "Gone" },
      ],
    });
    await reconcileModules(payload);
    expect(navRow(db, "group:abc")).toBeDefined();
    expect(navRow(db, "mod:gone:/a/gone")).toBeUndefined();
  });
});
