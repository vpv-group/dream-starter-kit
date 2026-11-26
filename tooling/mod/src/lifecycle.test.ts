import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModulesLock } from "./lock";
import { git, modifiedFiles, snapshotModule, supportsMergeBase } from "./git";
import {
  eject,
  EJECT_GITIGNORE,
  ensureEjectGitignore,
  mergeUpstream,
  parseSource,
} from "./lifecycle";

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

describe("eject", () => {
  beforeEach(() => {
    // The ejected repo's commit uses the user's identity; CI may have none.
    vi.stubEnv("GIT_AUTHOR_NAME", "test");
    vi.stubEnv("GIT_AUTHOR_EMAIL", "test@example.com");
    vi.stubEnv("GIT_COMMITTER_NAME", "test");
    vi.stubEnv("GIT_COMMITTER_EMAIL", "test@example.com");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** A kit repo with modules/demo installed, committed, and built. */
  function kitWithInstalledModule(): string {
    const repo = tempDir("mod-eject-test-");
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "test"]);
    writeFiles(repo, { ".gitignore": "node_modules\n.cache\n" });
    writeFiles(path.join(repo, "modules/demo"), {
      "package.json": "{}\n",
      "src/index.ts": "export {};\n",
    });
    const lock: ModulesLock = {
      lockVersion: 1,
      modules: {
        demo: {
          version: "1.2.0",
          kitCompat: "*",
          source: "local",
          stubs: [],
          edgeFunctions: [],
        },
      },
      tombstones: {},
    };
    writeFiles(repo, { "modules.lock": `${JSON.stringify(lock, null, 2)}\n` });
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "init"]);
    // What `pnpm install` + a test run leave in an installed module.
    const dir = path.join(repo, "modules/demo");
    mkdirSync(path.join(dir, "node_modules/@acme"), { recursive: true });
    symlinkSync("../../../config", path.join(dir, "node_modules/@acme/x"));
    writeFiles(dir, {
      "node_modules/.vite/vitest/results.json": "{}\n",
      ".cache/tsbuildinfo.json": "{}\n",
    });
    return repo;
  }

  function bareRemote(): string {
    const remote = path.join(tempDir("mod-eject-remote-"), "demo.git");
    git(path.dirname(remote), ["init", "-q", "--bare", remote]);
    return remote;
  }

  const readLockFile = (repo: string) =>
    JSON.parse(
      readFileSync(path.join(repo, "modules.lock"), "utf8"),
    ) as ModulesLock;

  it("pushes only module source, then pins the lock to the new repo", async () => {
    const repo = kitWithInstalledModule();
    const remote = bareRemote();

    await eject(repo, "demo", remote);

    expect(files(remote, "v1.2.0")).toEqual([
      ".gitignore",
      "package.json",
      "src/index.ts",
    ]);
    expect(git(remote, ["show", "v1.2.0:.gitignore"]).split("\n")).toEqual(
      EJECT_GITIGNORE,
    );
    const entry = readLockFile(repo).modules.demo;
    expect(entry?.source).toEqual({
      type: "github",
      repo: remote,
      ref: "v1.2.0",
      commit: git(remote, ["rev-parse", "main"]),
    });
    const base = entry?.baseCommit ?? "";
    expect(files(repo, base)).toEqual([
      "modules/demo/package.json",
      "modules/demo/src/index.ts",
    ]);
    expect(modifiedFiles(repo, "demo", base)).toEqual([]);
  });

  it("keeps the prepared repo when the push fails, and --resume finishes", async () => {
    const repo = kitWithInstalledModule();
    const missing = path.join(tempDir("mod-eject-none-"), "nope.git");
    const before = readFileSync(path.join(repo, "modules.lock"), "utf8");

    const err = await eject(repo, "demo", missing).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(err?.message).toMatch(/pushing demo to .* failed/);
    const kept = /--resume (\S+)/.exec(err?.message ?? "")?.[1] ?? "";
    dirs.push(kept);
    expect(err?.message).toContain(`The module repo is ready at ${kept}`);
    expect(existsSync(path.join(kept, ".git"))).toBe(true);
    expect(readFileSync(path.join(repo, "modules.lock"), "utf8")).toBe(before);

    const remote = bareRemote();
    await eject(repo, "demo", remote, { resume: kept });

    expect(existsSync(kept)).toBe(false);
    expect(files(remote, "v1.2.0")).not.toContain("node_modules/@acme/x");
    expect(readLockFile(repo).modules.demo?.source).toMatchObject({
      repo: remote,
      commit: git(remote, ["rev-parse", "main"]),
    });
  });
});

describe("ensureEjectGitignore", () => {
  it("adds only the entries a module's own .gitignore lacks", () => {
    const dir = tempDir("mod-gitignore-test-");
    writeFiles(dir, { ".gitignore": "node_modules/\n.env" });

    ensureEjectGitignore(dir);
    ensureEjectGitignore(dir);

    expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe(
      ["node_modules/", ".env", ...EJECT_GITIGNORE.slice(1)].join("\n") + "\n",
    );
  });
});
