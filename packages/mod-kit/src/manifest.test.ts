import { describe, expect, it } from "vitest";

import { defineModule } from "./manifest";

const minimal = {
  slug: "demo",
  name: "Demo",
  version: "1.0.0",
  kitCompat: ">=1.0.0 <2",
};

describe("defineModule", () => {
  it("applies defaults to a minimal manifest", () => {
    const m = defineModule(minimal);
    expect(m.platforms).toEqual({ web: true, native: true });
    expect(m.requires).toEqual([]);
    expect(m.nav.web).toEqual([]);
    expect(m.routes.native).toEqual([]);
    expect(m.server).toEqual({
      routes: false,
      publicRoutes: false,
      edgeFunctions: [],
    });
    expect(m.database.tables).toEqual([]);
    expect(m.cms.hasSettings).toBe(false);
    expect(m.env).toEqual({ hasServer: false, hasClient: false });
  });

  it("defaults nav order and route area", () => {
    const m = defineModule({
      ...minimal,
      nav: { web: [{ title: "Demo", href: "/a/demo" }] },
      routes: { web: [{ path: "", component: "DemoHome" }] },
    });
    expect(m.nav.web[0]?.order).toBe(100);
    expect(m.routes.web[0]?.area).toBe("app");
  });

  it("rejects bad slugs", () => {
    expect(() => defineModule({ ...minimal, slug: "Demo" })).toThrow();
    expect(() => defineModule({ ...minimal, slug: "x" })).toThrow();
    expect(() => defineModule({ ...minimal, slug: "9demo" })).toThrow();
    expect(() => defineModule({ ...minimal, slug: "demo_x" })).toThrow();
  });

  it("rejects non-semver versions", () => {
    expect(() => defineModule({ ...minimal, version: "v1.0.0" })).toThrow();
    expect(() => defineModule({ ...minimal, version: "1.0" })).toThrow();
  });

  it("rejects nav hrefs that are not absolute", () => {
    expect(() =>
      defineModule({
        ...minimal,
        nav: { web: [{ title: "Demo", href: "x/demo" }] },
      }),
    ).toThrow();
  });
});
