/**
 * Pure helpers for the /api/modules/ops route (no env, no I/O) so the PR
 * classification and dispatch rules are unit-tested (ops-core.test.ts).
 *
 * module-ops.yml opens two kinds of update PRs:
 *   - module ops: branch `mod/<op>-<slug>-<run>`, label `module-op`
 *     (`module-op-conflicts` when the update conflicts);
 *   - kit updates: branch `sync/upstream-<date>`, label `kit-update`
 *     (`kit-update-conflicts` when the merge conflicts).
 */

export type OpsPrKind = "module" | "kit";

export interface GithubPr {
  number: number;
  title: string;
  html_url: string;
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
}

/** Which kind of update PR this is, or null when it isn't one of ours. */
export function classifyOpsPr(
  pr: Pick<GithubPr, "labels" | "head">,
): OpsPrKind | null {
  const labels = pr.labels.map((l) => l.name);
  if (
    pr.head.ref.startsWith("sync/upstream-") ||
    labels.some((l) => l.startsWith("kit-update"))
  ) {
    return "kit";
  }
  if (
    pr.head.ref.startsWith("mod/") ||
    labels.some((l) => l.startsWith("module"))
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
    });
  }
  return out.sort((a, b) =>
    a.kind === b.kind ? a.number - b.number : a.kind === "kit" ? -1 : 1,
  );
}

export interface OpInput {
  op: "add" | "update" | "remove" | "kit-update";
  source?: string;
  slug?: string;
  version?: string;
  keepData?: boolean;
  sha256?: string;
}

/**
 * The workflow_dispatch body for module-ops.yml. Dispatches target the
 * repository's default branch (not a hard-coded `main`), which is where the
 * workflow file and the scheduled runs live.
 */
export function dispatchBody(input: OpInput, defaultBranch: string | null) {
  const kit = input.op === "kit-update";
  return {
    ref: defaultBranch ?? "main",
    inputs: {
      op: input.op,
      source: kit ? "" : (input.source ?? ""),
      slug: kit ? "" : (input.slug ?? ""),
      version: kit ? "" : (input.version ?? ""),
      keep_data: !kit && input.keepData ? "true" : "false",
      sha256: kit ? "" : (input.sha256 ?? ""),
    },
  };
}
