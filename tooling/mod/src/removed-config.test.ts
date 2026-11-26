import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { findRepoRoot } from "./paths";

/**
 * Settings removed in 2.4 (docs/UPDATING.md → Removed in 2.4): automatic
 * updates run through the Dream Updates GitHub App and /admin → Updates, so
 * none of these may come back. They may only be named in the notes that
 * tell existing installs to delete them, and in historical design docs.
 */
const REMOVED = [
  "MOD_OPS_TOKEN",
  "GITHUB_OPS_TOKEN",
  "DREAM_LICENSE_KEY",
  "MOD_CATALOG_URL",
  "MOD_REGISTRY_FIRST",
  "KIT_AUTO_UPDATE",
  "MOD_AUTO_UPDATE",
  "MOD_AUTO_MERGE",
  "KIT_UPSTREAM_URL",
];

const ALLOWED = new Set([
  "docs/UPDATING.md", // the "Removed in 2.4" table
  "docs/MODULES.md", // the extensions → modules rename table (history)
  "docs/MODULES-PLAN.md", // the original design
  "tooling/mod/src/removed-config.test.ts",
]);

describe("removed configuration", () => {
  it("is not read or documented anywhere else", () => {
    const root = findRepoRoot();
    let out: string;
    try {
      out = execFileSync(
        "git",
        ["-C", root, "grep", "-l", "-E", REMOVED.join("|")],
        { encoding: "utf8" },
      );
    } catch {
      out = ""; // git grep exits 1 when nothing matches
    }
    const offenders = out
      .split("\n")
      .filter(Boolean)
      .filter((file) => !ALLOWED.has(file));
    expect(offenders).toEqual([]);
  });
});
