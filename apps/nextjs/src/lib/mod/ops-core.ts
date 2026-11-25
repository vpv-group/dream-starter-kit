/**
 * Pure helpers for the /api/modules/ops route (no env, no I/O) so the PR
 * classification and dispatch rules are unit-tested (ops-core.test.ts).
 *
 * module-ops.yml opens two kinds of update PRs, all labeled `dream-update`:
 *   - modules: branch `dream/<op>-<slug>-<run>`;
 *   - kit updates: branch `dream/kit-update-<date>`.
 * `dream-update-conflicts` marks committed conflict markers, `dream-review`
 * one that needs a person, `dream-approved` one an admin approved. PRs from
 * before (branches `mod/*` and `sync/upstream-*`, labels `module-op*` and
 * `kit-update*`) are still recognized for one release.
 */

export type OpsPrKind = "module" | "kit";

export interface GithubPr {
  number: number;
  title: string;
  html_url: string;
  body?: string | null;
  labels: { name: string }[];
  head: { ref: string };
}

export interface OpsPr {
  number: number;
  title: string;
  url: string;
  kind: OpsPrKind;
  /** The PR carries committed conflict markers and needs a human. */
  conflicts: boolean;
  /** The merge step decided a person must look at it (a comment says why). */
  needsReview: boolean;
  /** An admin approved it in /admin: it merges once checks pass. */
  approved: boolean;
  /** From the PR's hidden marker: `kit` or the module slug, and versions. */
  slug: string | null;
  to: string | null;
}

const MARKER = /<!--\s*dream-update\s+(\{[\s\S]*?\})\s*-->/;

/** The slug and target version module-ops.yml wrote into the PR body. */
export function prTarget(body: string | null | undefined): {
  slug: string | null;
  to: string | null;
} {
  const match = body ? MARKER.exec(body) : null;
  try {
    const meta = match?.[1]
      ? (JSON.parse(match[1]) as { slug?: unknown; to?: unknown })
      : {};
    return {
      slug: typeof meta.slug === "string" ? meta.slug : null,
      to: typeof meta.to === "string" ? meta.to : null,
    };
  } catch {
    return { slug: null, to: null };
  }
}

/** Which kind of update PR this is, or null when it isn't one of ours. */
export function classifyOpsPr(
  pr: Pick<GithubPr, "labels" | "head">,
): OpsPrKind | null {
  const labels = pr.labels.map((l) => l.name);
  const ref = pr.head.ref;
  if (
    ref.startsWith("dream/kit-update-") ||
    ref.startsWith("sync/upstream-") ||
    labels.some((l) => l.startsWith("kit-update"))
  ) {
    return "kit";
  }
  if (
    ref.startsWith("dream/") ||
    ref.startsWith("mod/") ||
    labels.some((l) => l.startsWith("dream-update") || l.startsWith("module"))
  ) {
    return "module";
  }
  return null;
}

/** Open PRs → the update PRs /admin shows (kit first, then modules). */
export function toOpsPrs(prs: GithubPr[]): OpsPr[] {
  const out: OpsPr[] = [];
  for (const pr of prs) {
    const kind = classifyOpsPr(pr);
    if (!kind) continue;
    out.push({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      kind,
      conflicts: pr.labels.some((l) => l.name.endsWith("-conflicts")),
      needsReview: pr.labels.some((l) => l.name === "dream-review"),
      approved: pr.labels.some((l) => l.name === "dream-approved"),
      ...prTarget(pr.body),
    });
  }
  return out.sort((a, b) =>
    a.kind === b.kind ? a.number - b.number : a.kind === "kit" ? -1 : 1,
  );
}

export type OpName =
  "add" | "update" | "remove" | "kit-update" | "check" | "merge";

export interface OpInput {
  op: OpName;
  /** add: `dream:<slug>[@x.y.z]`; update: optional new origin. */
  source?: string;
  slug?: string;
  version?: string;
  keepData?: boolean;
  /** An admin clicked Install or Update: the PR merges once checks pass. */
  approved?: boolean;
  /** merge: the PR an admin chose with "Merge now". */
  pr?: number;
}

const MODULE_OPS = new Set<OpName>(["add", "update", "remove"]);

/**
 * The workflow_dispatch body for module-ops.yml. Dispatches target the
 * repository's default branch (not a hard-coded `main`), which is where the
 * workflow file and the scheduled runs live.
 */
export function dispatchBody(input: OpInput, defaultBranch: string | null) {
  const mod = MODULE_OPS.has(input.op);
  return {
    ref: defaultBranch ?? "main",
    inputs: {
      op: input.op,
      source: mod ? (input.source ?? "") : "",
      slug: mod ? (input.slug ?? "") : "",
      version: mod ? (input.version ?? "") : "",
      keep_data: mod && input.keepData ? "true" : "false",
      approved:
        input.approved && (input.op === "add" || input.op === "update")
          ? "true"
          : "false",
      pr: input.op === "merge" && input.pr ? String(input.pr) : "",
    },
  };
}
