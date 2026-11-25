import { describe, expect, it } from "vitest";

import type { ModSource } from "./lock";
import type { CatalogModule } from "./registry";
import {
  fallbackRepo,
  findInCatalog,
  normalizeRepo,
  planAdd,
  planUpdate,
  registryFirstEnabled,
} from "./source-plan";

const KIT = "2.3.0";
const CRM_REPO = "https://github.com/vpv-group/dream-mod-crm";
const catalog: CatalogModule[] = [
  { slug: "crm", latest: "1.2.0", kitCompat: ">=2.3.0 <3", paid: true },
  {
    slug: "docs",
    latest: "0.3.0",
    kitCompat: ">=2.0.0 <3",
    repo: "https://github.com/acme/dream-mod-docs",
  },
  { slug: "future", latest: "1.0.0", kitCompat: ">=9.0.0" },
];

const github = (repo: string): ModSource => ({
  type: "github",
  repo,
  ref: "v1.1.1",
  commit: "abc",
});

describe("registryFirstEnabled", () => {
  it("is on unless MOD_REGISTRY_FIRST=off", () => {
    expect(registryFirstEnabled({})).toBe(true);
    expect(registryFirstEnabled({ MOD_REGISTRY_FIRST: "on" })).toBe(true);
    expect(registryFirstEnabled({ MOD_REGISTRY_FIRST: " OFF " })).toBe(false);
  });
});

describe("normalizeRepo", () => {
  it("compares https, ssh and .git forms equally", () => {
    const want = "github.com/acme/mod-x";
    expect(normalizeRepo("https://github.com/Acme/mod-x.git")).toBe(want);
    expect(normalizeRepo("git@github.com:acme/mod-x.git")).toBe(want);
    expect(normalizeRepo("https://token@github.com/acme/mod-x/")).toBe(want);
  });
});

describe("findInCatalog", () => {
  it("matches by slug or repo, only when the kit can take a release", () => {
    expect(findInCatalog(catalog, { slug: "crm" }, KIT)?.slug).toBe("crm");
    expect(
      findInCatalog(
        catalog,
        { repo: "git@github.com:acme/dream-mod-docs" },
        KIT,
      )?.slug,
    ).toBe("docs");
    expect(findInCatalog(catalog, { slug: "future" }, KIT)).toBeNull();
    expect(findInCatalog(null, { slug: "crm" }, KIT)).toBeNull();
  });
});

describe("planUpdate", () => {
  it("moves a registry-listed GitHub module to the registry, GitHub as fallback", () => {
    expect(
      planUpdate("crm", github(CRM_REPO), catalog, {
        registryFirst: true,
        to: "v1.2.0",
        kitVersion: KIT,
      }),
    ).toEqual({
      primary: { kind: "registry", location: "dream:crm", ref: "1.2.0" },
      fallback: { kind: "github", location: CRM_REPO, ref: "v1.2.0" },
    });
  });

  it("keeps GitHub for unlisted modules, an unreachable catalog, or when off", () => {
    const repo = "https://github.com/acme/other";
    for (const [cat, registryFirst] of [
      [catalog, true],
      [null, true],
      [catalog, false],
    ] as const) {
      const slug = cat === catalog && !registryFirst ? "crm" : "other";
      expect(
        planUpdate(slug, github(repo), cat, { registryFirst, kitVersion: KIT }),
      ).toEqual({ primary: { kind: "github", location: repo } });
    }
  });

  it("falls back from the registry to the remembered or catalog repo", () => {
    const reg = (repo?: string): ModSource => ({
      type: "registry",
      registry: "https://r",
      slug: "docs",
      version: "0.2.0",
      sha256: "x",
      ...(repo ? { repo } : {}),
    });
    expect(
      planUpdate("docs", reg(CRM_REPO), null, {
        registryFirst: true,
        kitVersion: KIT,
      })?.fallback?.location,
    ).toBe(CRM_REPO);
    expect(
      planUpdate("docs", reg(), catalog, {
        registryFirst: true,
        kitVersion: KIT,
      })?.fallback?.location,
    ).toBe("https://github.com/acme/dream-mod-docs");
    expect(
      planUpdate("docs", reg(), null, { registryFirst: true, kitVersion: KIT })
        ?.fallback,
    ).toBeUndefined();
  });

  it("can't update zip or local installs", () => {
    expect(
      planUpdate("x", "local", catalog, { registryFirst: true }),
    ).toBeNull();
    expect(
      planUpdate(
        "x",
        { type: "zip", sha256: "x", filename: "x.zip" },
        catalog,
        { registryFirst: true },
      ),
    ).toBeNull();
  });
});

describe("planAdd", () => {
  it("installs a registry-listed GitHub url from the registry", () => {
    const src = {
      kind: "github" as const,
      location: "https://github.com/acme/dream-mod-docs",
      ref: "v0.3.0",
    };
    expect(
      planAdd(src, catalog, { registryFirst: true, kitVersion: KIT }),
    ).toEqual({
      primary: { kind: "registry", location: "dream:docs", ref: "0.3.0" },
      fallback: src,
    });
    expect(
      planAdd(src, catalog, { registryFirst: false, kitVersion: KIT }),
    ).toEqual({ primary: src });
  });

  it("gives dream:<slug> its public repo as fallback when it has one", () => {
    expect(
      planAdd({ kind: "registry", location: "dream:docs@0.3.0" }, catalog, {
        registryFirst: true,
        kitVersion: KIT,
      }).fallback,
    ).toEqual({
      kind: "github",
      location: "https://github.com/acme/dream-mod-docs",
      ref: "v0.3.0",
    });
    expect(
      planAdd({ kind: "registry", location: "dream:crm" }, catalog, {
        registryFirst: true,
        kitVersion: KIT,
      }).fallback,
    ).toBeUndefined();
  });

  it("never touches zips", () => {
    const zip = { kind: "zip" as const, location: "/x.zip" };
    expect(planAdd(zip, catalog, { registryFirst: true })).toEqual({
      primary: zip,
    });
  });
});

describe("fallbackRepo", () => {
  it("remembers the GitHub repo a module came from", () => {
    const plan = {
      primary: { kind: "registry" as const, location: "dream:crm" },
    };
    expect(fallbackRepo(plan, github(CRM_REPO))).toBe(CRM_REPO);
    expect(fallbackRepo(plan, undefined, "https://c")).toBe("https://c");
    expect(fallbackRepo(plan, undefined)).toBeUndefined();
  });
});
