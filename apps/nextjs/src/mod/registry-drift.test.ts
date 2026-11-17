import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildAllGeneratedFiles,
  findRepoRoot,
  loadModules,
  readLock,
  toAbs,
} from "@acme/mod-tools";

/**
 * The host consumes modules ONLY through generated registries + route stubs
 * (docs/MODULES-PLAN.md §2). This test recomputes the expected contents
 * from each module's module.config.ts and fails the suite when the
 * committed files drift — i.e. someone changed a module without running
 * `pnpm mod sync` and committing the result. Sibling of the existing
 * supabase migrations drift test (../lib/db/migrations-drift.test.ts).
 */
describe("generated module registries", () => {
  const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

  it("match the manifests — run `pnpm mod sync` if this fails", async () => {
    const mods = await loadModules(repoRoot);
    for (const file of buildAllGeneratedFiles(mods)) {
      const abs = toAbs(repoRoot, file.path);
      expect(existsSync(abs), `${file.path} is missing`).toBe(true);
      expect(readFileSync(abs, "utf8"), `content drift in ${file.path}`).toBe(
        file.content,
      );
    }
  });

  it("lock stub bookkeeping matches the generated stubs", async () => {
    const mods = await loadModules(repoRoot);
    const expected = buildAllGeneratedFiles(mods).filter((f) => f.slug);
    const lock = readLock(repoRoot);
    for (const mod of mods) {
      const recorded = [...(lock.modules[mod.manifest.slug]?.stubs ?? [])];
      const wanted = expected
        .filter((f) => f.slug === mod.manifest.slug)
        .map((f) => f.path);
      expect(
        recorded.sort(),
        `stale stub records for ${mod.manifest.slug}`,
      ).toEqual(wanted.sort());
    }
  });

  it("every installed module has a lock entry (and vice versa)", async () => {
    const mods = await loadModules(repoRoot);
    const lock = readLock(repoRoot);
    expect(Object.keys(lock.modules).sort()).toEqual(
      mods.map((e) => e.manifest.slug).sort(),
    );
  });
});
