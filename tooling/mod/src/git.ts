import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Git plumbing for the vendored-module lifecycle (docs/MODULES-PLAN.md
 * §4): pristine-base snapshot refs (refs/mod-base/<slug>) that make updates a
 * real three-way merge even after squash merges, and local-modification
 * detection against the pinned base.
 */

export function git(repoRoot: string, args: string[], input?: string): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/**
 * Snapshot commits are internal plumbing (refs/mod-base/*), not user history,
 * so they carry a fixed identity: `pnpm mod add` must work on CI runners and
 * machines with no git user configured.
 */
const SNAPSHOT_IDENTITY = {
  GIT_AUTHOR_NAME: "Dream modules",
  GIT_AUTHOR_EMAIL: "modules@dream.invalid",
  GIT_COMMITTER_NAME: "Dream modules",
  GIT_COMMITTER_EMAIL: "modules@dream.invalid",
};

/** `git commit-tree` with the snapshot identity. Returns the commit sha. */
export function commitTree(repoRoot: string, args: string[]): string {
  return execFileSync("git", ["commit-tree", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...SNAPSHOT_IDENTITY },
  }).trim();
}

const baseRef = (slug: string) => `refs/mod-base/${slug}`;
/** Where snapshots lived before modules (once "extensions") were renamed. */
const legacyBaseRef = (slug: string) => `refs/ext-base/${slug}`;

/** NUL-separated `git ls-files` output, as a list. */
function lsFiles(repoRoot: string, args: string[]): string[] {
  return execFileSync("git", ["ls-files", "-z", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
}

const existsOnDisk = (file: string) => {
  try {
    lstatSync(file); // lstat: a dangling symlink still counts
    return true;
  } catch {
    return false;
  }
};

/**
 * The files of modules/<slug>/ as git sees them: everything the repo tracks
 * that is still on disk, plus untracked files .gitignore doesn't exclude.
 * Ignored files never count, even though an installed module has plenty of
 * them (node_modules/ full of pnpm symlinks, .cache/tsbuildinfo.json,
 * node_modules/.vite, .turbo/): they are not module source, the working tree
 * never commits them, and in a snapshot they read as local modifications.
 */
export function moduleFiles(repoRoot: string, slug: string): string[] {
  const dir = `modules/${slug}`;
  const tracked = lsFiles(repoRoot, ["--", dir]);
  const untracked = lsFiles(repoRoot, [
    "--others",
    "--exclude-standard",
    "--",
    dir,
  ]);
  return [...new Set([...tracked, ...untracked])]
    .filter((file) => !file.endsWith("/")) // a nested repo, not a file
    .filter((file) => existsOnDisk(path.join(repoRoot, file)))
    .sort();
}

/**
 * Write the tree of the CURRENT worktree state of modules/<slug>/ (exactly
 * moduleFiles(), through a throwaway index) and return its sha.
 */
export function writeModuleTree(repoRoot: string, slug: string): string {
  const indexFile = path.join(
    mkdtempSync(path.join(tmpdir(), "mod-index-")),
    "index",
  );
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  const run = (args: string[], input?: string) =>
    execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      env,
      input,
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  try {
    run(["read-tree", "--empty"]);
    const files = moduleFiles(repoRoot, slug);
    if (files.length > 0) {
      run(
        ["update-index", "--add", "-z", "--stdin"],
        files.map((file) => `${file}\0`).join(""),
      );
    }
    return run(["write-tree"]);
  } finally {
    rmSync(path.dirname(indexFile), { recursive: true, force: true });
  }
}

/**
 * Synthetic commit of the CURRENT worktree state of modules/<slug>/ (no
 * ref update) — the building block for snapshots and three-way merges.
 * Ignored files are left out (see moduleFiles).
 */
export function commitModuleTree(
  repoRoot: string,
  slug: string,
  message: string,
  parent?: string,
): string {
  const tree = writeModuleTree(repoRoot, slug);
  return commitTree(repoRoot, [
    tree,
    ...(parent ? ["-p", parent] : []),
    "-m",
    message,
  ]);
}

/**
 * Extract `modules/<slug>` of a tree-ish into `dest`, with the module folder
 * as the root (symlinks and file modes kept, as git stores them).
 */
export function exportModuleTree(
  repoRoot: string,
  slug: string,
  treeish: string,
  dest: string,
): void {
  const archive = execFileSync(
    "git",
    ["archive", "--format=tar", `${treeish}:modules/${slug}`],
    { cwd: repoRoot, maxBuffer: 1024 * 1024 * 1024 },
  );
  execFileSync("tar", ["-x", "-C", dest], { input: archive });
}

export function currentBase(repoRoot: string, slug: string): string | null {
  for (const ref of [baseRef(slug), legacyBaseRef(slug)]) {
    try {
      return git(repoRoot, ["rev-parse", "--verify", "--quiet", ref]);
    } catch {
      // try the next ref
    }
  }
  return null;
}

/**
 * Snapshots taken before modules were renamed hold the module at
 * extensions/<slug>/. Re-root such a commit at modules/<slug>/ (a new commit
 * with the old one as parent) so local-modification diffs and three-way
 * merges compare like with like. Newer snapshots are returned unchanged.
 */
export function rerootLegacyBase(
  repoRoot: string,
  slug: string,
  base: string,
): string {
  const has = (treePath: string) => {
    try {
      git(repoRoot, ["cat-file", "-e", `${base}:${treePath}`]);
      return true;
    } catch {
      return false;
    }
  };
  if (has(`modules/${slug}`) || !has(`extensions/${slug}`)) return base;
  const moduleTree = git(repoRoot, ["rev-parse", `${base}:extensions/${slug}`]);
  const modulesDir = git(
    repoRoot,
    ["mktree"],
    `040000 tree ${moduleTree}\t${slug}\n`,
  );
  const root = git(
    repoRoot,
    ["mktree"],
    `040000 tree ${modulesDir}\tmodules\n`,
  );
  return commitTree(repoRoot, [
    root,
    "-p",
    base,
    "-m",
    `mod-base: ${slug} (re-rooted from extensions/)`,
  ]);
}

/**
 * Write a synthetic commit containing ONLY the current (pristine) tree of
 * modules/<slug>/ and advance refs/mod-base/<slug> to it (chaining the
 * previous base as parent so history stays reachable). Returns the commit sha.
 */
export function snapshotModule(
  repoRoot: string,
  slug: string,
  version: string,
): string {
  const commit = commitModuleTree(
    repoRoot,
    slug,
    `mod-base: ${slug} v${version}`,
    currentBase(repoRoot, slug) ?? undefined,
  );
  git(repoRoot, ["update-ref", baseRef(slug), commit]);
  return commit;
}

/**
 * Files under modules/<slug>/ differing from the pinned pristine base. The
 * worktree side is the module as moduleFiles() sees it, so a just-vendored
 * module that isn't committed yet, or one with untracked new files, compares
 * correctly, and ignored files (node_modules/, .cache/) never count.
 */
export function modifiedFiles(
  repoRoot: string,
  slug: string,
  baseCommit: string,
): string[] {
  try {
    const out = git(repoRoot, [
      "diff",
      "--name-only",
      baseCommit,
      writeModuleTree(repoRoot, slug),
      "--",
      `modules/${slug}`,
    ]);
    return out === "" ? [] : out.split("\n");
  } catch {
    // Base commit unreachable (e.g. ref lost on a fresh clone) — unknown.
    return [];
  }
}

/** `git merge-tree --merge-base` (what mergeTrees runs) arrived in git 2.40. */
const MIN_MERGE_GIT: readonly [number, number] = [2, 40];

/** The installed git's [major, minor], or null if `git --version` is odd. */
export function gitVersion(): [number, number] | null {
  const out = execFileSync("git", ["--version"], { encoding: "utf8" });
  const match = /(\d+)\.(\d+)/.exec(out);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function supportsMergeBase(
  version: [number, number] | null = gitVersion(),
): boolean {
  if (!version) return true; // unknown format: let git itself decide
  const [major, minor] = version;
  const [minMajor, minMinor] = MIN_MERGE_GIT;
  return major > minMajor || (major === minMajor && minor >= minMinor);
}

/**
 * Fail before an update touches anything when git is too old for
 * mergeTrees. Apple's bundled git (2.39.x) is: without this check the update
 * crashed after modules/<slug>/ had already been swapped for upstream files.
 */
export function assertMergeTreeSupport(): void {
  const version = gitVersion();
  if (supportsMergeBase(version)) return;
  throw new Error(
    `pnpm mod update needs git ${MIN_MERGE_GIT.join(".")} or newer ` +
      `(for \`git merge-tree --merge-base\`), but this git is ` +
      `${version?.join(".") ?? "unknown"}. Nothing was changed. Install a ` +
      `newer git (macOS: \`brew install git\`, then make sure it comes ` +
      `first on PATH) and run the update again.`,
  );
}

export interface MergeResult {
  tree: string;
  conflicts: string[];
}

/**
 * Three-way merge: base (pinned pristine), ours (current vendored tree,
 * possibly locally modified), theirs (new upstream snapshot). Conflicted
 * files carry standard markers in the written tree.
 */
export function mergeTrees(
  repoRoot: string,
  base: string,
  ours: string,
  theirs: string,
): MergeResult {
  try {
    const tree = git(repoRoot, [
      "merge-tree",
      "--write-tree",
      `--merge-base=${base}`,
      ours,
      theirs,
    ]);
    return { tree: tree.split("\n")[0] ?? tree, conflicts: [] };
  } catch (err) {
    // Exit 1 = conflicts; stdout still carries the tree + conflict listing.
    const out = (err as { stdout?: string }).stdout?.toString().trim() ?? "";
    const [tree = "", ...rest] = out.split("\n");
    const conflicts = [
      ...new Set(
        rest
          .filter((l) => l.startsWith("CONFLICT") === false && l.includes("\t"))
          .map((l) => l.split("\t").pop() ?? "")
          .filter(Boolean),
      ),
    ];
    if (!tree) throw err;
    return { tree, conflicts };
  }
}

/** Materialize `modules/<slug>` out of a tree-ish into the worktree. */
export function checkoutModuleTree(
  repoRoot: string,
  slug: string,
  treeish: string,
): void {
  rmSync(path.join(repoRoot, "modules", slug), {
    recursive: true,
    force: true,
  });
  execFileSync(
    "bash",
    ["-c", `git archive ${treeish} modules/${slug} | tar -x`],
    { cwd: repoRoot },
  );
}
