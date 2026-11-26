import semver from "semver";

/**
 * Should an update PR merge itself now? (docs/MODULES.md → Automatic updates)
 *
 * Pure, so every rule is pinned by decide-merge.test.ts. The workflow gathers
 * the facts (labels, changed files, check runs, the registry's settings and
 * hold, release eligibility, attestation result) and acts on the decision.
 *
 * Order matters: things that stop EVERY merge come first (a global hold,
 * conflicts, removals, missing or failing checks), then the rules an admin's
 * explicit approval (the `dream-approved` label, set when they click Install,
 * Update or Merge in /admin) may override, then the automatic-merge setting.
 */

export type PrKind = "kit" | "module";
export type PrOp = "add" | "update" | "remove" | "kit-update";

export interface PrFacts {
  kind: PrKind;
  op: PrOp;
  /** `kit` or the module slug. */
  slug: string;
  fromVersion?: string;
  toVersion?: string;
  labels: string[];
  changedFiles: string[];
  /** The PR adds a migration with a contract step (migration-safety.ts). */
  contractMigration: boolean;
}

export interface CheckSummary {
  total: number;
  pending: number;
  failed: number;
}

export interface UpdateSettings {
  autoMerge: boolean;
  /** Slugs (`kit` for the starter kit) whose updates are paused. */
  paused: string[];
  /** `<slug>@<version>` the owner chose to skip. */
  skipped: string[];
}

export interface MergeContext {
  /** Meet Dream's global hold (kill switch); null when not held. */
  hold: string | null;
  /** The release has passed its soak time / canary stage for this site. */
  eligible: boolean;
  /** The release's build attestation verified on this run. */
  attestationVerified: boolean;
  /** Branch protection still requires a human review. */
  reviewRequired: boolean;
  /** Another update already merged in this run (one at a time). */
  mergedThisRun: boolean;
}

export type MergeDecision =
  | { action: "merge"; method: "merge" | "squash" }
  | { action: "wait"; reason: WaitReason }
  | { action: "review"; reason: ReviewReason };

export type WaitReason =
  | "hold"
  | "checks-pending"
  | "not-eligible-yet"
  | "required-review"
  | "one-at-a-time";

export type ReviewReason =
  | "conflicts"
  | "removal"
  | "no-checks"
  | "checks-failed"
  | "paused"
  | "skipped"
  | "workflow-change"
  | "contract-migration"
  | "major-version"
  | "attestation"
  | "auto-merge-off";

export const APPROVED_LABEL = "dream-approved";

export function isMajorUpdate(from?: string, to?: string): boolean {
  const a = from ? semver.coerce(from) : null;
  const b = to ? semver.coerce(to) : null;
  if (!a || !b) return false;
  return semver.major(b) > semver.major(a);
}

export function touchesWorkflows(files: string[]): boolean {
  return files.some((f) => f.startsWith(".github/workflows/"));
}

export function decideMerge(
  pr: PrFacts,
  checks: CheckSummary,
  settings: UpdateSettings,
  ctx: MergeContext,
): MergeDecision {
  // Stops every merge, approved or not.
  if (ctx.hold) return { action: "wait", reason: "hold" };
  if (pr.labels.some((l) => l.endsWith("-conflicts"))) {
    return { action: "review", reason: "conflicts" };
  }
  if (pr.op === "remove") return { action: "review", reason: "removal" };
  if (checks.total === 0) return { action: "review", reason: "no-checks" };
  if (checks.pending > 0) return { action: "wait", reason: "checks-pending" };
  if (checks.failed > 0) return { action: "review", reason: "checks-failed" };
  if (!ctx.attestationVerified)
    return { action: "review", reason: "attestation" };

  const approved = pr.labels.includes(APPROVED_LABEL);
  if (!approved) {
    if (settings.paused.includes(pr.slug)) {
      return { action: "review", reason: "paused" };
    }
    if (
      pr.toVersion &&
      settings.skipped.includes(`${pr.slug}@${pr.toVersion}`)
    ) {
      return { action: "review", reason: "skipped" };
    }
    if (touchesWorkflows(pr.changedFiles)) {
      return { action: "review", reason: "workflow-change" };
    }
    if (pr.contractMigration) {
      return { action: "review", reason: "contract-migration" };
    }
    if (isMajorUpdate(pr.fromVersion, pr.toVersion)) {
      return { action: "review", reason: "major-version" };
    }
    if (!ctx.eligible) return { action: "wait", reason: "not-eligible-yet" };
  }

  if (ctx.reviewRequired) return { action: "wait", reason: "required-review" };
  if (ctx.mergedThisRun) return { action: "wait", reason: "one-at-a-time" };
  if (!approved && !settings.autoMerge) {
    return { action: "review", reason: "auto-merge-off" };
  }
  // Kit updates keep their history (merge commit) so the next one stays a
  // plain three-way merge; module ops squash.
  return { action: "merge", method: pr.kind === "kit" ? "merge" : "squash" };
}
