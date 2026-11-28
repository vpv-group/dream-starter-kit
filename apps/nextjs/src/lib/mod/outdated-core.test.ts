import { describe, expect, it } from "vitest";

import type { OpsPr } from "./ops-core";
import type { OutdatedInput } from "./outdated-core";
import { cleanVersion, planOutdated, updateOps } from "./outdated-core";

const base = (over: Partial<OutdatedInput> = {}): OutdatedInput => ({
  kit: { current: "2.5.0", latest: "v2.6.0" },
  installed: [
    { slug: "crm", name: "CRM", version: "1.2.0" },
    { slug: "docs", name: "Docs", version: "1.0.0" },
    { slug: "sync", name: "Sync", version: "0.3.0" },
  ],
  lock: {
    crm: { version: "1.2.0", source: "registry" },
    docs: { version: "1.0.0", source: "local" },
    sync: { version: "0.3.0", source: { type: "github", url: "x" } },
  },
  catalog: [
    { slug: "crm", latest: "1.2.1", kitCompat: ">=2.4.0 <3" },
    { slug: "docs", latest: "1.1.0" },
    { slug: "sync", latest: "0.4.0", kitCompat: ">=2.6.0 <3" },
  ],
  entitled: new Set(["crm"]),
  settings: { paused: [], skipped: [] },
  prs: [],
  runs: [],
  ...over,
});

const pr = (over: Partial<OpsPr>): OpsPr => ({
  number: 1,
  title: "t",
  url: "https://github.com/o/r/pull/1",
  kind: "module",
  conflicts: false,
  needsReview: false,
  approved: false,
  slug: null,
  to: null,
  also: [],
  ...over,
});

describe("cleanVersion", () => {
  it("strips a leading v and rejects junk", () => {
    expect(cleanVersion("v2.6.0")).toBe("2.6.0");
    expect(cleanVersion("2.6.0")).toBe("2.6.0");
    expect(cleanVersion("latest")).toBeNull();
    expect(cleanVersion(null)).toBeNull();
  });
});

describe("planOutdated", () => {
  it("offers the kit and updatable modules, not bundled ones", () => {
    const state = planOutdated(base());
    expect(state.kit).toEqual({ from: "2.5.0", to: "2.6.0", pr: null });
    expect(state.modules.map((m) => [m.slug, m.to, m.needsKit])).toEqual([
      ["crm", "1.2.1", false],
      ["sync", "0.4.0", true],
    ]);
    expect(state.running).toBe(false);
  });

  it("no kit entry when up to date or the release is unknown", () => {
    expect(
      planOutdated(base({ kit: { current: "2.6.0", latest: "v2.6.0" } })).kit,
    ).toBeNull();
    expect(
      planOutdated(base({ kit: { current: "2.5.0", latest: null } })).kit,
    ).toBeNull();
  });

  it("drops a module the newest kit can't run either", () => {
    const state = planOutdated(
      base({ kit: { current: "2.5.0", latest: null } }),
    );
    expect(state.modules.map((m) => m.slug)).toEqual(["crm"]);
  });

  it("skips registry modules the license doesn't cover", () => {
    const state = planOutdated(base({ entitled: new Set() }));
    expect(state.modules.map((m) => m.slug)).toEqual(["sync"]);
  });

  it("honors pinned, paused and skipped", () => {
    const state = planOutdated(
      base({
        lock: {
          ...base().lock,
          crm: { version: "1.2.0", source: "registry", pinned: true },
        },
        settings: { paused: ["kit"], skipped: ["sync@0.4.0"] },
      }),
    );
    expect(state.kit).toBeNull();
    expect(state.modules).toEqual([]);
  });

  it("links open PRs and reports running ops", () => {
    const state = planOutdated(
      base({
        prs: [
          pr({ number: 7, kind: "kit", url: "u7" }),
          pr({ number: 8, slug: "crm", url: "u8" }),
        ],
        runs: [{ status: "in_progress" }],
      }),
    );
    expect(state.kit?.pr).toEqual({ number: 7, url: "u7" });
    expect(state.modules.find((m) => m.slug === "crm")?.pr).toEqual({
      number: 8,
      url: "u8",
    });
    expect(state.running).toBe(true);
  });
});

describe("updateOps", () => {
  it("dispatches the kit and ready modules, nothing already in a PR", () => {
    expect(updateOps(planOutdated(base()))).toEqual([
      { op: "kit-update" },
      { op: "update", slug: "crm" },
    ]);
    expect(
      updateOps(
        planOutdated(base({ prs: [pr({ kind: "kit" }), pr({ slug: "crm" })] })),
      ),
    ).toEqual([]);
  });
});
