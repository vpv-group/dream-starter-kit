import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { git, snapshotModule, supportsMergeBase } from "./git";
import { mergeUpstream, parseSource } from "./lifecycle";

describe("parseSource", () => {
  it("resolves a relative zip against the directory pnpm was run in", () => {
    expect(parseSource("../crm-1.0.0.zip", "/work/kit")).toEqual({
      kind: "zip",
      location: path.resolve("/work/crm-1.0.0.zip"),
    });
  });

  it("keeps an absolute zip path", () => {
    expect(parseSource("/dl/crm.zip", "/work/kit").location).toBe(
      path.resolve("/dl/crm.zip"),
    );
  });

  it("splits a GitHub url and tag", () => {
    expect(
      parseSource("https://github.com/acme/mod-x#v1.2.0", "/work/kit"),
    ).toEqual({
      kind: "github",
      location: "https://github.com/acme/mod-x",
      ref: "v1.2.0",
    });
  });

  it("recognizes the Dream registry", () => {
    expect(parseSource("dream:crm", "/work/kit").kind).toBe("registry");
  });

  it("treats a bare slug as the Dream registry", () => {
    expect(parseSource("crm", "/work/kit")).toEqual({
      kind: "registry",
      location: "dream:crm",
    });
    expect(parseSource("client-portal@1.2.0", "/work/kit").location).toBe(
      "dream:client-portal@1.2.0",
    );
    expect(parseSource("crm.zip", "/work/kit").kind).toBe("zip");
  });
});

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
}

/** A repo with modules/demo/ installed at v1.0.0 and its snapshot taken. */
function installedRepo(files: Record<string, string>) {
  const repo = tempDir("mod-update-test-");
  git(repo, ["init", "-q"]);
  writeFiles(path.join(repo, "modules/demo"), files);
  const oldBase = snapshotModule(repo, "demo", "1.0.0");
  return { repo, oldBase };
}

/** The upstream release, as fetchSource leaves it: the package root. */
function upstream(files: Record<string, string>): string {
  const dir = tempDir("mod-upstream-test-");
  writeFiles(dir, files);
  return dir;
}

const read = (repo: string, file: string) =>
  readFileSync(path.join(repo, "modules/demo", file), "utf8");
const show = (repo: string, commit: string, file: string) =>
  git(repo, ["show", `${commit}:modules/demo/${file}`]);
const files = (repo: string, commit: string) =>
  git(repo, ["ls-tree", "-r", "--name-only", commit]).split("\n");

// `git merge-tree --merge-base` needs git 2.40+ (CI has it; Apple's 2.39
// doesn't, and update() refuses to run there — see assertMergeTreeSupport).
describe.skipIf(!supportsMergeBase())("mergeUpstream", () => {
  it("chains the new pristine base onto the old one", () => {
    const { repo, oldBase } = installedRepo({
      "a.txt": "a v1\n",
      "b.txt": "b v1\n",
    });
    writeFiles(path.join(repo, "modules/demo"), { "b.txt": "b local\n" });

    const result = mergeUpstream(
      repo,
      "demo",
      upstream({ "a.txt": "a v2\n", "b.txt": "b v1\n", "c.txt": "new\n" }),
      "1.1.0",
      oldBase,
    );

    const newBase = result.baseCommit;
    expect(result.conflicts).toEqual([]);
    // Parent = old base, so pushing refs/mod-base/* fast-forwards.
    expect(git(repo, ["rev-parse", `${newBase}^`])).toBe(oldBase);
    expect(git(repo, ["rev-parse", "refs/mod-base/demo"])).toBe(newBase);
    expect(git(repo, ["log", "-1", "--format=%an|%s", newBase])).toBe(
      "Dream modules|mod-base: demo v1.1.0",
    );
    // Tree = the pristine upstream snapshot, without the local edit.
    expect(files(repo, newBase)).toEqual([
      "modules/demo/a.txt",
      "modules/demo/b.txt",
      "modules/demo/c.txt",
    ]);
    expect(show(repo, newBase, "a.txt")).toBe("a v2");
    expect(show(repo, newBase, "b.txt")).toBe("b v1");
    // The worktree has the merge: upstream changes plus the local edit.
    expect(read(repo, "a.txt")).toBe("a v2\n");
    expect(read(repo, "b.txt")).toBe("b local\n");
    expect(read(repo, "c.txt")).toBe("new\n");
  });

  it("advances the chained base even when the merge conflicts", () => {
    const { repo, oldBase } = installedRepo({ "a.txt": "a v1\n" });
    writeFiles(path.join(repo, "modules/demo"), { "a.txt": "a local\n" });

    const result = mergeUpstream(
      repo,
      "demo",
      upstream({ "a.txt": "a v2\n" }),
      "2.0.0",
      oldBase,
    );

    expect(result.conflicts).toEqual(["modules/demo/a.txt"]);
    expect(read(repo, "a.txt")).toContain("<<<<<<<");
    // `--continue` keeps this base: it only re-validates and syncs.
    expect(git(repo, ["rev-parse", `${result.baseCommit}^`])).toBe(oldBase);
    expect(git(repo, ["rev-parse", "refs/mod-base/demo"])).toBe(
      result.baseCommit,
    );
    expect(show(repo, result.baseCommit, "a.txt")).toBe("a v2");
  });
});

describe("mergeUpstream failure", () => {
  it("restores modules/<slug> and leaves the base ref alone", () => {
    const { repo, oldBase } = installedRepo({ "a.txt": "a v1\n" });
    writeFiles(path.join(repo, "modules/demo"), { "a.txt": "a local\n" });
    const missing = "0".repeat(40); // merge-tree can't use it as a base

    expect(() =>
      mergeUpstream(
        repo,
        "demo",
        upstream({ "a.txt": "a v2\n" }),
        "2.0.0",
        missing,
      ),
    ).toThrow();

    expect(read(repo, "a.txt")).toBe("a local\n");
    expect(git(repo, ["rev-parse", "refs/mod-base/demo"])).toBe(oldBase);
  });
});
