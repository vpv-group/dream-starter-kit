import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  commitModuleTree,
  currentBase,
  git,
  modifiedFiles,
  moduleFiles,
  rerootLegacyBase,
  snapshotModule,
  supportsMergeBase,
} from "./git";

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

describe("commitModuleTree without a git identity", () => {
  it("commits the snapshot with the fixed module identity", () => {
    // No user.* and no global/system config, like a fresh CI runner.
    const dir = mkdtempSync(path.join(tmpdir(), "mod-git-noid-"));
    repos.push(dir);
    const emptyConfig = path.join(dir, "empty.gitconfig");
    writeFileSync(emptyConfig, "");
    vi.stubEnv("GIT_CONFIG_GLOBAL", emptyConfig);
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    vi.stubEnv("HOME", dir);
    try {
      const repo = path.join(dir, "repo");
      mkdirSync(path.join(repo, "modules", "demo"), { recursive: true });
      git(repo, ["init", "-q"]);
      writeFileSync(path.join(repo, "modules", "demo", "a.txt"), "hi\n");
      const sha = commitModuleTree(repo, "demo", "mod-base: demo v1.0.0");
      expect(git(repo, ["log", "-1", "--format=%an <%ae>", sha])).toBe(
        "Dream modules <modules@dream.invalid>",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/**
 * An installed module: source files plus what `pnpm install` and a build
 * leave behind (pnpm's node_modules symlinks, a tsbuildinfo cache), under
 * the kit's own ignore rules.
 */
function installedModule(repo: string): void {
  writeFileSync(path.join(repo, ".gitignore"), "node_modules\n.cache\n");
  const dir = path.join(repo, "modules/demo");
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "package.json"), "{}\n");
  writeFileSync(path.join(dir, "src/index.ts"), "export {};\n");
  mkdirSync(path.join(dir, "node_modules/.bin"), { recursive: true });
  mkdirSync(path.join(dir, "node_modules/@acme"), { recursive: true });
  symlinkSync("../../../config", path.join(dir, "node_modules/@acme/config"));
  symlinkSync(
    "../vitest/vitest.mjs",
    path.join(dir, "node_modules/.bin/vitest"),
  );
  mkdirSync(path.join(dir, "node_modules/.vite"), { recursive: true });
  writeFileSync(path.join(dir, "node_modules/.vite/results.json"), "{}\n");
  mkdirSync(path.join(dir, ".cache"), { recursive: true });
  writeFileSync(path.join(dir, ".cache/tsbuildinfo.json"), "{}\n");
}

const SOURCE_FILES = ["modules/demo/package.json", "modules/demo/src/index.ts"];

describe("module snapshots skip ignored files", () => {
  it("leaves node_modules/ and .cache/ out of the snapshot", () => {
    const repo = tempRepo();
    installedModule(repo);

    expect(moduleFiles(repo, "demo")).toEqual(SOURCE_FILES);
    const base = snapshotModule(repo, "demo", "1.0.0");
    expect(files(repo, base)).toEqual(SOURCE_FILES);
  });

  it("has no modified files right after a snapshot, committed or not", () => {
    const repo = tempRepo();
    installedModule(repo);
    const base = snapshotModule(repo, "demo", "1.0.0");

    // Just vendored (`pnpm mod add`): nothing tracked yet.
    expect(modifiedFiles(repo, "demo", base)).toEqual([]);
    // After the user commits it (and after `pnpm mod eject`).
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "add demo"]);
    expect(modifiedFiles(repo, "demo", base)).toEqual([]);
  });

  it("reports edits, deletions and untracked new files", () => {
    const repo = tempRepo();
    installedModule(repo);
    const base = snapshotModule(repo, "demo", "1.0.0");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "add demo"]);

    writeFileSync(path.join(repo, "modules/demo/src/index.ts"), "edit\n");
    rmSync(path.join(repo, "modules/demo/package.json"));
    writeFileSync(path.join(repo, "modules/demo/src/new.ts"), "new\n");
    writeFileSync(path.join(repo, "modules/demo/.cache/more.json"), "{}\n");

    expect(modifiedFiles(repo, "demo", base)).toEqual([
      "modules/demo/package.json",
      "modules/demo/src/index.ts",
      "modules/demo/src/new.ts",
    ]);
  });

  it("keeps a file the repo tracks even when it matches an ignore rule", () => {
    const repo = tempRepo();
    installedModule(repo);
    writeFileSync(path.join(repo, "modules/demo/.cache/keep.json"), "{}\n");
    git(repo, ["add", "-f", "modules/demo/.cache/keep.json"]);

    expect(moduleFiles(repo, "demo")).toEqual([
      "modules/demo/.cache/keep.json",
      ...SOURCE_FILES,
    ]);
  });
});

describe("supportsMergeBase", () => {
  it("requires git 2.40 for merge-tree --merge-base", () => {
    expect(supportsMergeBase([2, 39])).toBe(false);
    expect(supportsMergeBase([2, 40])).toBe(true);
    expect(supportsMergeBase([3, 0])).toBe(true);
    expect(supportsMergeBase(null)).toBe(true);
  });
});
