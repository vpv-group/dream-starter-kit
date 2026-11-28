import { describe, expect, it } from "vitest";

import type { FetchedModule } from "./install-set";
import {
  DependencyError,
  readRequiresFromConfig,
  resolveInstallSet,
} from "./install-set";

describe("readRequiresFromConfig", () => {
  it("reads a one-line and a multi-line requires", () => {
    expect(readRequiresFromConfig(`requires: ["projects"],`)).toEqual([
      "projects",
    ]);
    expect(
      readRequiresFromConfig(
        `  requires: [\n    "billing",\n    'chat',\n  ],`,
      ),
    ).toEqual(["billing", "chat"]);
  });

  it("is empty without requires or with an empty list", () => {
    expect(readRequiresFromConfig(`slug: "x",`)).toEqual([]);
    expect(readRequiresFromConfig(`requires: [],`)).toEqual([]);
  });
});

/** A fake registry: slug → requires. `dream:<slug>` or a URL ending in it. */
function registry(
  mods: Record<string, string[]>,
  missing: Record<string, string> = {},
) {
  const fetched: string[] = [];
  const fetch = (source: string): Promise<FetchedModule<null>> => {
    fetched.push(source);
    const slug = source.replace(/^dream:/, "").replace(/^.*\//, "");
    if (missing[slug]) return Promise.reject(new Error(missing[slug]));
    const requires = mods[slug];
    if (!requires) return Promise.reject(new Error(`unknown ${slug}`));
    return Promise.resolve({ slug, requires, payload: null });
  };
  return { fetch, fetched };
}

const slugs = (mods: FetchedModule<null>[]) => mods.map((m) => m.slug);

describe("resolveInstallSet", () => {
  it("adds a missing dependency first, in the same set", async () => {
    const reg = registry({
      "projects-adapter-github": ["projects"],
      projects: [],
    });
    const set = await resolveInstallSet(["dream:projects-adapter-github"], {
      isInstalled: () => false,
      fetch: reg.fetch,
    });
    expect(slugs(set)).toEqual(["projects", "projects-adapter-github"]);
  });

  it("skips dependencies that are already installed", async () => {
    const reg = registry({ "projects-adapter-github": ["projects"] });
    const set = await resolveInstallSet(["dream:projects-adapter-github"], {
      isInstalled: (s) => s === "projects",
      fetch: reg.fetch,
    });
    expect(slugs(set)).toEqual(["projects-adapter-github"]);
    expect(reg.fetched).toEqual(["dream:projects-adapter-github"]);
  });

  it("resolves recursively and installs a shared dependency once", async () => {
    const reg = registry({
      a: ["b", "c"],
      b: ["c"],
      c: [],
      d: ["c"],
    });
    const set = await resolveInstallSet(["dream:a", "dream:d"], {
      isInstalled: () => false,
      fetch: reg.fetch,
    });
    expect(slugs(set)).toEqual(["c", "b", "a", "d"]);
    expect(reg.fetched.filter((s) => s === "dream:c")).toHaveLength(1);
  });

  it("doesn't loop on a cycle", async () => {
    const reg = registry({ a: ["b"], b: ["a"] });
    const set = await resolveInstallSet(["dream:a"], {
      isInstalled: () => false,
      fetch: reg.fetch,
    });
    expect(slugs(set)).toEqual(["b", "a"]);
  });

  it("names the dependency that can't be added", async () => {
    const reg = registry(
      { "projects-adapter-github": ["projects"] },
      {
        projects:
          "license inactive — updates paused (your plan does not include this module)",
      },
    );
    const err = await resolveInstallSet(["dream:projects-adapter-github"], {
      isInstalled: () => false,
      fetch: reg.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DependencyError);
    expect((err as Error).message).toBe(
      "projects-adapter-github requires the \"projects\" module, which isn't installed and couldn't be added: license inactive — updates paused (your plan does not include this module)",
    );
  });

  it("refuses a requested module that is already installed", async () => {
    const reg = registry({ crm: [] });
    await expect(
      resolveInstallSet(["dream:crm"], {
        isInstalled: (s) => s === "crm",
        fetch: reg.fetch,
      }),
    ).rejects.toThrow("modules/crm already exists");
  });
});
