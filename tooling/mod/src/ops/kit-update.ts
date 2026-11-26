import { readFileSync } from "node:fs";
import path from "node:path";
import semver from "semver";

import { git } from "../git";

/**
 * Which Dream Starter Kit release should this repository be offered?
 * (`pnpm mod ops kit-plan`, called by module-ops.yml's `kit-update` job.)
 *
 * Kit updates follow PUBLISHED RELEASES (`vX.Y.Z` tags with a GitHub Release
 * and a build attestation, made by the kit's release.yml), never the kit's
 * `main` branch: with automatic merging, every commit on `main` would
 * otherwise reach every app. Pre-releases (`v2.4.0-rc.1`) are skipped.
 */

/** Local ref the chosen release tag is fetched into. */
export const RELEASE_REF = "refs/remotes/upstream/release";

/** The newest stable `vX.Y.Z` tag, or null when there is none. */
export function pickLatestRelease(tagNames: string[]): string | null {
  const stable = tagNames
    .map((t) => t.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""))
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t) && semver.valid(t));
  if (stable.length === 0) return null;
  return [...new Set(stable)].sort(semver.rcompare)[0] ?? null;
}

export type KitPlan =
  | { action: "no-release" }
  | { action: "up-to-date"; tag: string; latest: string; current: string }
  | {
      action: "merge";
      tag: string;
      latest: string;
      current: string;
      ref: string;
      /** No shared history yet ("Use this template" / Vercel clone). */
      unrelated: boolean;
      /** The release commit's ISO date. */
      publishedAt: string;
    };

export function tagsAt(repoRoot: string, upstreamUrl: string): string[] {
  const out = git(repoRoot, ["ls-remote", "--tags", upstreamUrl]);
  return out
    .split("\n")
    .map((line) => line.split("\t")[1] ?? "")
    .filter(Boolean);
}

export function hasCommonHistory(
  repoRoot: string,
  a: string,
  b: string,
): boolean {
  try {
    git(repoRoot, ["merge-base", a, b]);
    return true;
  } catch {
    return false;
  }
}

function isAncestor(repoRoot: string, a: string, b: string): boolean {
  try {
    git(repoRoot, ["merge-base", "--is-ancestor", a, b]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decide, and fetch the chosen tag into RELEASE_REF so the workflow can merge
 * it. `head` is the branch the update PR targets (default: HEAD).
 */
export function planKitUpdate(opts: {
  repoRoot: string;
  upstreamUrl: string;
  head?: string;
}): KitPlan {
  const { repoRoot, upstreamUrl } = opts;
  const head = opts.head ?? "HEAD";
  const tag = pickLatestRelease(tagsAt(repoRoot, upstreamUrl));
  if (!tag) return { action: "no-release" };

  git(repoRoot, [
    "fetch",
    "--quiet",
    "--no-tags",
    upstreamUrl,
    `+refs/tags/${tag}:${RELEASE_REF}`,
  ]);
  const latest = tag.slice(1);
  const current = readVersion(repoRoot, head);
  if (isAncestor(repoRoot, RELEASE_REF, head)) {
    return { action: "up-to-date", tag, latest, current };
  }
  return {
    action: "merge",
    tag,
    latest,
    current,
    ref: RELEASE_REF,
    unrelated: !hasCommonHistory(repoRoot, RELEASE_REF, head),
    // The release commit's date: when its soak time starts (eligibility.ts).
    publishedAt: git(repoRoot, ["log", "-1", "--format=%cI", RELEASE_REF]),
  };
}

function readVersion(repoRoot: string, rev: string): string {
  try {
    const pkg = JSON.parse(git(repoRoot, ["show", `${rev}:package.json`])) as {
      version?: string;
    };
    return pkg.version ?? "unknown";
  } catch {
    try {
      const pkg = JSON.parse(
        readFileSync(path.join(repoRoot, "package.json"), "utf8"),
      ) as { version?: string };
      return pkg.version ?? "unknown";
    } catch {
      return "unknown";
    }
  }
}

/** `key=value` lines for $GITHUB_OUTPUT. */
export function toGithubOutput(plan: KitPlan): string {
  const entries: [string, string][] = [["action", plan.action]];
  if (plan.action !== "no-release") {
    entries.push(
      ["tag", plan.tag],
      ["latest", plan.latest],
      ["current", plan.current],
    );
  }
  if (plan.action === "merge") {
    entries.push(
      ["ref", plan.ref],
      ["unrelated", String(plan.unrelated)],
      ["published_at", plan.publishedAt],
    );
  }
  return entries.map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
}
