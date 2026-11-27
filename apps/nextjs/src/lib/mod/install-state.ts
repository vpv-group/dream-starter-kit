/**
 * Where each module's install is, for the /admin "Install a module" drawer
 * (an App Store–style button: Install → a progress ring → Installed). Pure:
 * no fetch, no env, unit tested (install-state.test.ts).
 *
 * An install moves through module-ops.yml and its pull request:
 *
 *   requested  the admin clicked Install (optimistic, before GitHub knows)
 *   preparing  a module-ops run that names the module is queued or running
 *   checking   its install PR is open (checks run, then it merges itself)
 *   deploying  the PR merged; the site hasn't redeployed with it yet
 *   installed  the running app has it (the generated registry lists it)
 *   failed     the latest run for it failed, or its PR needs a person
 *
 * A PR or run counts for every module it installs: the requested one and its
 * marker's `also` (dependencies, the rest of a batch).
 */

export type InstallStage =
  | "idle"
  | "requested"
  | "preparing"
  | "checking"
  | "deploying"
  | "installed"
  | "failed";

export interface InstallState {
  stage: InstallStage;
  /** 0–1 for the ring; null = indeterminate. */
  progress: number | null;
  /** Short status under the button ("Running checks"). */
  label: string | null;
  /** The pull request or run to open for details. */
  url: string | null;
}

export interface InstallRun {
  status: string;
  conclusion: string | null;
  url: string;
  createdAt: string;
  /** From the run-name (ops-core runTarget); null for unnamed runs. */
  target: { op: string; slugs: string[] } | null;
}

export interface InstallPr {
  url: string;
  slug: string | null;
  also: string[];
  conflicts: boolean;
  needsReview: boolean;
}

export interface InstallStateInput {
  /** Modules the running app has (modInstalled). */
  installed: ReadonlySet<string>;
  /** Open module PRs (ops-core toOpsPrs, kind "module"). */
  openPrs: InstallPr[];
  /** Module PRs merged recently (their deploy may still be running). */
  mergedPrs: InstallPr[];
  runs: InstallRun[];
  /** slug → when this browser asked for it (ms since epoch). */
  pending: ReadonlyMap<string, number>;
  now: number;
}

export const STAGE: Record<
  Exclude<InstallStage, "idle" | "installed" | "failed">,
  { progress: number | null; label: string }
> = {
  requested: { progress: null, label: "Starting…" },
  preparing: { progress: 0.3, label: "Preparing" },
  checking: { progress: 0.6, label: "Running checks" },
  deploying: { progress: 0.9, label: "Deploying" },
};

const IDLE: InstallState = {
  stage: "idle",
  progress: null,
  label: null,
  url: null,
};

/** A click stays "requested" this long while GitHub catches up. */
export const PENDING_TTL_MS = 15 * 60_000;

const prSlugs = (pr: InstallPr) =>
  pr.slug ? [pr.slug, ...pr.also] : [...pr.also];

export function installStateFor(
  slug: string,
  input: InstallStateInput,
): InstallState {
  if (input.installed.has(slug)) {
    return { stage: "installed", progress: 1, label: null, url: null };
  }

  const open = input.openPrs.find((pr) => prSlugs(pr).includes(slug));
  if (open) {
    if (open.conflicts || open.needsReview) {
      return {
        stage: "failed",
        progress: null,
        label: open.conflicts ? "Needs attention" : "Needs your review",
        url: open.url,
      };
    }
    return { stage: "checking", ...STAGE.checking, url: open.url };
  }

  const merged = input.mergedPrs.find((pr) => prSlugs(pr).includes(slug));
  if (merged) {
    return { stage: "deploying", ...STAGE.deploying, url: merged.url };
  }

  // The newest run that names this module.
  const run = input.runs
    .filter(
      (r) =>
        r.target &&
        ["add", "update"].includes(r.target.op) &&
        r.target.slugs.includes(slug),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const requestedAt = input.pending.get(slug);
  const runAt = run ? Date.parse(run.createdAt) : NaN;
  // A click newer than the run it would otherwise show wins: a retry after a
  // failure starts as "requested", not "failed".
  const clickIsNewer =
    requestedAt !== undefined &&
    (Number.isNaN(runAt) || requestedAt > runAt + 5_000);

  if (run && !clickIsNewer) {
    if (run.status !== "completed") {
      return { stage: "preparing", ...STAGE.preparing, url: run.url };
    }
    if (run.conclusion === "failure") {
      return {
        stage: "failed",
        progress: null,
        label: "Install failed",
        url: run.url,
      };
    }
    // Completed without a PR (yet): the PR list lags the run by seconds.
    if (input.now - runAt < 2 * 60_000) {
      return { stage: "preparing", ...STAGE.preparing, url: run.url };
    }
  }

  if (requestedAt !== undefined && input.now - requestedAt < PENDING_TTL_MS) {
    return { stage: "requested", ...STAGE.requested, url: null };
  }
  return IDLE;
}

/** Stages during which the button can't start another install. */
export function isBusy(state: InstallState): boolean {
  return ["requested", "preparing", "checking", "deploying"].includes(
    state.stage,
  );
}

/** Slugs with an install in flight (the POST route refuses to repeat them). */
export function slugsInFlight(
  input: Omit<InstallStateInput, "pending" | "installed"> & {
    installed?: ReadonlySet<string>;
  },
  slugs: string[],
): string[] {
  const full: InstallStateInput = {
    ...input,
    installed: input.installed ?? new Set(),
    pending: new Map(),
  };
  return slugs.filter((s) => isBusy(installStateFor(s, full)));
}
