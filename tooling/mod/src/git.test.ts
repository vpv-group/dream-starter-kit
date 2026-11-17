import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { commitModuleTree, currentBase, git, rerootLegacyBase } from "./git";

const repos: string[] = [];
afterEach(() => {
  for (const dir of repos.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mod-git-test-"));
  repos.push(dir);
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "test"]);
  return dir;
}

/** A pre-rename snapshot: the module's tree lives at extensions/<slug>/. */
function legacySnapshot(repo: string, slug: string): string {
  const blob = git(repo, ["hash-object", "-w", "--stdin"], "hello\n");
  const moduleTree = git(repo, ["mktree"], `100644 blob ${blob}\ta.txt\n`);
  const dir = git(repo, ["mktree"], `040000 tree ${moduleTree}\t${slug}\n`);
  const root = git(repo, ["mktree"], `040000 tree ${dir}\textensions\n`);
  return git(repo, ["commit-tree", root, "-m", "ext-base: demo"]);
}

const files = (repo: string, commit: string) =>
  git(repo, ["ls-tree", "-r", "--name-only", commit]).split("\n");

describe("rerootLegacyBase", () => {
  it("moves a pre-rename snapshot from extensions/<slug> to modules/<slug>", () => {
    const repo = tempRepo();
    const legacy = legacySnapshot(repo, "demo");

    const rerooted = rerootLegacyBase(repo, "demo", legacy);

    expect(rerooted).not.toBe(legacy);
    expect(files(repo, rerooted)).toEqual(["modules/demo/a.txt"]);
    expect(git(repo, ["rev-parse", `${rerooted}^`])).toBe(legacy);
  });

  it("returns current snapshots unchanged", () => {
    const repo = tempRepo();
    mkdirSync(path.join(repo, "modules/demo"), { recursive: true });
    writeFileSync(path.join(repo, "modules/demo/a.txt"), "hello\n");
    const snapshot = commitModuleTree(repo, "demo", "mod-base: demo");

    expect(rerootLegacyBase(repo, "demo", snapshot)).toBe(snapshot);
  });

  it("finds a base under the legacy refs/ext-base ref", () => {
    const repo = tempRepo();
    const legacy = legacySnapshot(repo, "demo");
    git(repo, ["update-ref", "refs/ext-base/demo", legacy]);

    expect(currentBase(repo, "demo")).toBe(legacy);
  });
});
