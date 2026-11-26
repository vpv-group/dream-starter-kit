import { readFileSync } from "node:fs";
import path from "node:path";

import { git } from "../git";
import { hasCommonHistory, tagsAt } from "./kit-update";

/**
 * `pnpm mod ops baseline` — give a repository that shares no git history
 * with the kit (a Vercel clone, "Use this template", a squashed import) the
 * kit release it started from as an ancestor, without changing a file.
 *
 * It merges the kit tag matching this repo's `package.json` version with
 * `-s ours`: the tree stays exactly as it is, but from then on the next kit
 * update is a normal three-way merge from that release instead of a huge
 * `--allow-unrelated-histories` merge (docs/UPDATING.md). module-ops.yml's
 * kit-update job runs it first, once; it is a no-op afterwards.
 */

export const BASELINE_REF = "refs/remotes/upstream/baseline";

export type BaselinePlan =
  | { action: "not-needed" }
  | { action: "no-release"; version: string }
  | { action: "merge"; tag: string; ref: string };

function headVersion(repoRoot: string): string {
  const pkg = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as { version?: string };
  return pkg.version ?? "0.0.0";
}

export function planBaseline(opts: {
  repoRoot: string;
  upstreamUrl: string;
}): BaselinePlan {
  const { repoRoot, upstreamUrl } = opts;
  const version = headVersion(repoRoot);
  const tag = `v${version}`;
  const tags = new Set(
    tagsAt(repoRoot, upstreamUrl).map((t) =>
      t.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""),
    ),
  );
  if (!tags.has(tag)) return { action: "no-release", version };
  git(repoRoot, [
    "fetch",
    "--quiet",
    "--no-tags",
    upstreamUrl,
    `+refs/tags/${tag}:${BASELINE_REF}`,
  ]);
  if (hasCommonHistory(repoRoot, BASELINE_REF, "HEAD")) {
    return { action: "not-needed" };
  }
  return { action: "merge", tag, ref: BASELINE_REF };
}

/**
 * Record the release as an ancestor. Returns the new commit; throws (and
 * leaves HEAD untouched) if the merge would change any file.
 */
export function applyBaseline(
  repoRoot: string,
  plan: Extract<BaselinePlan, { action: "merge" }>,
): string {
  const before = git(repoRoot, ["rev-parse", "HEAD"]);
  git(repoRoot, [
    "merge",
    "--quiet",
    "-s",
    "ours",
    "--allow-unrelated-histories",
    "--no-edit",
    "-m",
    `chore(kit): record Dream Starter Kit ${plan.tag} as an ancestor (no file changes)`,
    plan.ref,
  ]);
  try {
    git(repoRoot, ["diff", "--quiet", before, "HEAD"]);
  } catch {
    git(repoRoot, ["reset", "--quiet", "--hard", before]);
    throw new Error("baseline merge changed files; undone");
  }
  return git(repoRoot, ["rev-parse", "HEAD"]);
}

export function baselineOutput(plan: BaselinePlan): string {
  const lines = [`action=${plan.action}`];
  if (plan.action === "merge") lines.push(`tag=${plan.tag}`);
  if (plan.action === "no-release") lines.push(`version=${plan.version}`);
  return `${lines.join("\n")}\n`;
}
