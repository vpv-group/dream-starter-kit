import type { MergeDecision, PrFacts } from "./decide-merge";
import type {
  CheckRun,
  CommitStatus,
  GitHubClient,
  PrFile,
  PullRequest,
} from "./github";
import type { PrMeta } from "./pr-meta";
import type { ReportEvent } from "./report";
import type { OpsSession } from "./session";
import { findContractStatements } from "../migration-safety";
import { APPROVED_LABEL, decideMerge } from "./decide-merge";
import { isEligible } from "./eligibility";
import {
  CONFLICTS_LABEL,
  REMOVE_LABEL,
  REVIEW_LABEL,
  updatePrMeta,
} from "./pr-meta";

/**
 * `pnpm mod ops merge` — module-ops.yml's `merge` job, run after every CI
 * run and on the daily schedule (docs/MODULES.md → Automatic updates).
 *
 * For each open update PR, oldest first: gather the facts (marker, labels,
 * changed files, check runs, mergeability), ask `decideMerge`, and act —
 * merge at most one PR per run, label the ones that need a person (once,
 * with a comment saying why), and report outcomes to Meet Dream. After a
 * merge it watches the production deployment GitHub records for the merge
 * commit; a failed deploy is reported, which pauses automatic merging.
 */

export interface MergeDeps {
  gh: GitHubClient;
  session: OpsSession;
  report: (
    event: ReportEvent,
    meta: PrMeta,
    pr: number,
    detail?: string,
  ) => Promise<void>;
  now?: () => Date;
  /** "Merge now" in /admin: this PR counts as approved on this run. */
  approvePr?: number;
  /** Polls GitHub deployments after a merge; injected so tests don't wait. */
  watchDeploy?: (sha: string) => Promise<"ok" | "failed" | "unknown">;
  log?: (line: string) => void;
}

export interface PrOutcome {
  pr: number;
  slug: string;
  decision: MergeDecision;
  merged?: boolean;
  deploy?: "ok" | "failed" | "unknown";
}

const FAILED_CONCLUSIONS = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
  "stale",
]);

/**
 * Check runs and commit statuses → the counts decideMerge needs. Skipped and
 * neutral runs count as passed; a status is pending, success, or failed
 * (failure/error). Vercel reports as a commit status, so both are read.
 */
export function summarizeChecks(
  runs: CheckRun[],
  statuses: CommitStatus[] = [],
) {
  let pending = 0;
  let failed = 0;
  for (const run of runs) {
    if (run.status !== "completed") pending++;
    else if (run.conclusion && FAILED_CONCLUSIONS.has(run.conclusion)) failed++;
  }
  for (const status of statuses) {
    if (status.state === "pending") pending++;
    else if (status.state === "failure" || status.state === "error") failed++;
  }
  return { total: runs.length + statuses.length, pending, failed };
}

const MIGRATION_FILE =
  /^(supabase\/migrations\/|modules\/[^/]+\/supabase\/migrations\/|apps\/nextjs\/src\/payload\/migrations\/).+\.sql$/;

/** Does the PR add SQL that contracts the schema (drop, rename, …)? */
export function addsContractMigration(files: PrFile[]): boolean {
  return files.some((f) => {
    if (!MIGRATION_FILE.test(f.filename) || !f.patch) return false;
    const added = f.patch
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1))
      .join("\n");
    return findContractStatements(added).length > 0;
  });
}

export function prFacts(
  pr: PullRequest,
  meta: PrMeta,
  files: PrFile[],
): PrFacts {
  const labels = [...pr.labels];
  // GitHub says the branch no longer merges cleanly: treat as conflicts.
  if (pr.mergeableState === "dirty") labels.push(CONFLICTS_LABEL);
  return {
    kind: meta.kind,
    op: meta.op,
    slug: meta.slug,
    ...(meta.from ? { fromVersion: meta.from } : {}),
    ...(meta.to ? { toVersion: meta.to } : {}),
    labels,
    changedFiles: files.map((f) => f.filename),
    contractMigration: addsContractMigration(files),
  };
}

/** Meet Dream's holds that apply to this PR (global or this release). */
export function holdFor(session: OpsSession, meta: PrMeta): string | null {
  if (session.hold) return session.hold;
  const held = session.releaseHolds.some(
    (h) => h.target === meta.slug && (!meta.to || h.version === meta.to),
  );
  return held
    ? `Meet Dream is holding ${meta.slug}${meta.to ? ` ${meta.to}` : ""}: too many sites' updates failed.`
    : null;
}

const REVIEW_REASONS: Record<string, string> = {
  conflicts: "it has merge conflicts to resolve",
  removal: "removing a module drops its data",
  "no-checks": "no checks ran on it (is CI turned off?)",
  "checks-failed": "a check failed",
  paused: "updates for it are paused in /admin",
  skipped: "you chose to skip this version in /admin",
  "workflow-change": "it changes files in .github/workflows",
  "contract-migration":
    "it removes or changes existing database columns or tables",
  "major-version": "it is a major version",
  attestation: "its source could not be verified",
  "auto-merge-off": "automatic merging is off in /admin → Updates",
};

export async function runMerge(deps: MergeDeps): Promise<PrOutcome[]> {
  const { gh, session } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  const outcomes: PrOutcome[] = [];
  let mergedThisRun = false;

  const pulls = (await gh.listOpenPulls())
    .filter((pr) => updatePrMeta(pr) !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const listed of pulls) {
    const meta = updatePrMeta(listed);
    if (!meta) continue;
    // The list endpoint doesn't compute mergeability; the single PR does.
    const pr = await gh.getPull(listed.number);
    const [files, runs, statuses] = await Promise.all([
      gh.listFiles(pr.number),
      gh.listCheckRuns(pr.headSha),
      gh.listStatuses(pr.headSha),
    ]);
    const facts = prFacts(pr, meta, files);
    if (meta.op === "remove" && !facts.labels.includes(REMOVE_LABEL)) {
      facts.labels.push(REMOVE_LABEL);
    }
    if (deps.approvePr === pr.number) facts.labels.push(APPROVED_LABEL);
    const checks = summarizeChecks(runs, statuses);
    const decision = decideMerge(
      facts,
      checks,
      {
        // A failed deploy paused merging until the owner resumes it.
        autoMerge: session.settings.autoMerge && !session.settings.pausedReason,
        paused: session.settings.paused,
        skipped: session.settings.skipped,
      },
      {
        hold: holdFor(session, meta),
        eligible: isEligible(
          { publishedAt: new Date(meta.publishedAt ?? pr.createdAt) },
          session.site,
          now(),
        ),
        attestationVerified: meta.verified,
        reviewRequired:
          pr.mergeableState === "blocked" &&
          checks.pending === 0 &&
          checks.failed === 0,
        mergedThisRun,
      },
    );
    const outcome: PrOutcome = { pr: pr.number, slug: meta.slug, decision };
    outcomes.push(outcome);
    log(`#${pr.number} ${meta.slug}: ${JSON.stringify(decision)}`);

    if (decision.action === "review" && !pr.labels.includes(REVIEW_LABEL)) {
      // First time this PR needs a person: say why once, report failures.
      await gh.addLabels(pr.number, [REVIEW_LABEL]);
      await gh.comment(
        pr.number,
        `This update needs a review before it goes live: ${REVIEW_REASONS[decision.reason] ?? decision.reason}. Merge it yourself when you're happy, or close it to skip.`,
      );
      if (decision.reason === "checks-failed") {
        await deps.report("checks_failed", meta, pr.number);
      } else if (decision.reason === "conflicts") {
        await deps.report("conflicts", meta, pr.number);
      }
    }
    if (decision.action !== "merge") continue;

    const result = await gh.merge(pr.number, decision.method, pr.headSha);
    outcome.merged = result.merged;
    if (!result.merged) {
      log(`#${pr.number} didn't merge: ${result.message}`);
      await deps.report("merge_failed", meta, pr.number, result.message);
      continue;
    }
    mergedThisRun = true;
    await deps.report("merged", meta, pr.number);
    if (result.sha && deps.watchDeploy) {
      const deploy = await deps.watchDeploy(result.sha);
      outcome.deploy = deploy;
      if (deploy === "ok") await deps.report("deploy_ok", meta, pr.number);
      if (deploy === "failed") {
        await deps.report("deploy_failed", meta, pr.number);
      }
    }
  }
  return outcomes;
}

/**
 * Wait for the production deployment GitHub records for `sha` (Vercel and
 * most hosts post one). "unknown" when none appears in time — then nothing
 * is paused or reported.
 */
export async function watchDeployment(
  gh: GitHubClient,
  sha: string,
  opts: {
    timeoutMs?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<"ok" | "failed" | "unknown"> {
  const timeoutMs = opts.timeoutMs ?? 15 * 60_000;
  const intervalMs = opts.intervalMs ?? 30_000;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let waited = 0; waited <= timeoutMs; waited += intervalMs) {
    const states = await gh.deploymentStates(sha).catch(() => []);
    if (states.some((s) => s === "failure" || s === "error")) return "failed";
    if (states.length > 0 && states.every((s) => s === "success")) return "ok";
    await sleep(intervalMs);
  }
  return "unknown";
}
