import { z } from "zod/v4";

import type { GithubPr } from "~/lib/mod/ops-core";
import {
  githubApi,
  PAID_MODULES_DISABLED,
  paidModulesEnabled,
  requireAdmin,
} from "~/lib/mod/admin-ops";
import { slugsInFlight } from "~/lib/mod/install-state";
import { dispatchBody, runTarget, toOpsPrs } from "~/lib/mod/ops-core";
import { isPaidOp } from "~/lib/mod/paid-ops";
import { modInstalled } from "~/mod/registry.data.generated";

/**
 * Module operations (docs/MODULES-PLAN.md §6): every mutation dispatches
 * .github/workflows/module-ops.yml, which runs the real `pnpm mod` CLI on a
 * runner and opens a labeled PR — installed/updated code is always reviewed as
 * a diff and gated by CI before it can run. Installs from /admin come from the
 * Dream catalog only (`dream:<slug>`); GitHub-URL and zip installs are CLI-only
 * for module authors. Clicking Install or Update approves that PR, so it
 * merges once its checks pass. `kit-update` and `check` run the daily checks
 * now; `merge` merges whatever is ready. `add` takes `sources` (a batch:
 * one run, one PR) and answers 409 for a module already being installed.
 * GET lists recent runs (with the op and modules their run-name names), open
 * module and kit update PRs, and module PRs merged in the last two hours —
 * what the Install drawer's progress rings read (lib/mod/install-state.ts).
 */

const SLUG = /^[a-z][a-z0-9-]{0,63}$/;

const DREAM_SOURCE =
  /^dream:[a-z][a-z0-9-]{0,63}(@v?\d+\.\d+\.\d+(?:[-.][\w.-]+)?)?$/;

const opSchema = z.object({
  op: z.enum(["add", "update", "remove", "kit-update", "check", "merge"]),
  /** add: dream:<slug>[@x.y.z]. update: optional dream:<slug> to switch to. */
  source: z.string().regex(DREAM_SOURCE).optional(),
  /** add: several catalog modules installed together (one run, one PR). */
  sources: z.array(z.string().regex(DREAM_SOURCE)).min(1).max(20).optional(),
  slug: z.string().regex(SLUG).optional(),
  version: z.string().max(40).optional(),
  keepData: z.boolean().optional(),
  /** merge: the PR an admin chose with "Merge now". */
  pr: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const parsed = opSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid op" }, { status: 400 });
  }
  const { op, source, sources, slug, version, keepData, pr } = parsed.data;
  const addSources = op === "add" ? (sources ?? (source ? [source] : [])) : [];
  if (op === "add" && addSources.length === 0) {
    return Response.json(
      { error: "Pick a module from the Dream catalog." },
      { status: 400 },
    );
  }
  if (
    (addSources.length > 0
      ? addSources.some((s) => isPaidOp({ op, source: s, slug }))
      : isPaidOp({ op, source, slug })) &&
    !(await paidModulesEnabled())
  ) {
    return Response.json(PAID_MODULES_DISABLED, { status: 403 });
  }

  // Never start a second install of a module that is already on its way
  // (a run, an open PR, or a merge still deploying).
  if (op === "add") {
    const requested = addSources.map((s) =>
      s.replace(/^dream:/, "").replace(/@.*$/, ""),
    );
    const busy = slugsInFlight(await opsState(), requested);
    if (busy.length > 0) {
      return Response.json(
        {
          error: `Already being installed: ${busy.join(", ")}.`,
          inFlight: busy,
        },
        { status: 409 },
      );
    }
  }

  // Dispatch on the repository's default branch, where the workflow lives.
  const repoRes = await githubApi("");
  if (repoRes.status === 503) return repoRes;
  const defaultBranch = repoRes.ok
    ? (((await repoRes.json()) as { default_branch?: string }).default_branch ??
      null)
    : null;

  const res = await githubApi("/actions/workflows/module-ops.yml/dispatches", {
    method: "POST",
    body: JSON.stringify(
      dispatchBody(
        // Clicking Install or Update in /admin is the approval.
        {
          op,
          source,
          ...(addSources.length > 0 ? { sources: addSources } : {}),
          slug,
          version,
          keepData,
          pr,
          approved: true,
        },
        defaultBranch,
      ),
    ),
  });
  if (res.status === 503) return res;
  if (!res.ok) {
    return Response.json(
      { error: `GitHub dispatch failed (${res.status})` },
      { status: 502 },
    );
  }
  return Response.json({ dispatched: true });
}

interface RawRun {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  display_title: string;
}

/** Module PRs merged in the last two hours: their deploy may be running. */
const MERGED_WINDOW_MS = 2 * 60 * 60_000;

async function fetchOps() {
  const [runsRes, prsRes, closedRes] = await Promise.all([
    githubApi("/actions/workflows/module-ops.yml/runs?per_page=20"),
    githubApi("/pulls?state=open&per_page=50"),
    githubApi("/pulls?state=closed&sort=updated&direction=desc&per_page=20"),
  ]);
  const runs = runsRes.ok
    ? (((await runsRes.json()) as { workflow_runs?: RawRun[] }).workflow_runs ??
      [])
    : [];
  const prs = prsRes.ok ? ((await prsRes.json()) as GithubPr[]) : [];
  const closed = closedRes.ok ? ((await closedRes.json()) as GithubPr[]) : [];
  const since = Date.now() - MERGED_WINDOW_MS;
  const merged = closed.filter(
    (p) => p.merged_at && Date.parse(p.merged_at) >= since,
  );
  return { runsRes, runs, prs: toOpsPrs(prs), merged: toOpsPrs(merged) };
}

/** The install-state inputs the duplicate-request guard needs. */
async function opsState() {
  const { runs, prs, merged } = await fetchOps();
  const installed = new Set(modInstalled.map((m) => m.slug));
  const asPr = (p: ReturnType<typeof toOpsPrs>[number]) => ({
    url: p.url,
    slug: p.slug,
    also: p.also,
    conflicts: p.conflicts,
    needsReview: p.needsReview,
  });
  return {
    installed,
    openPrs: prs.filter((p) => p.kind === "module").map(asPr),
    // Merged but already in this build = done, not deploying.
    mergedPrs: merged
      .filter((p) => p.kind === "module")
      .filter((p) => !(p.slug && installed.has(p.slug)))
      .map(asPr),
    runs: runs.map((r) => ({
      status: r.status,
      conclusion: r.conclusion,
      url: r.html_url,
      createdAt: r.created_at,
      target: runTarget(r.display_title),
    })),
    now: Date.now(),
  };
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const { runsRes, runs, prs, merged } = await fetchOps();
  if (runsRes.status === 503) return runsRes;

  return Response.json({
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      conclusion: r.conclusion,
      url: r.html_url,
      createdAt: r.created_at,
      title: r.display_title,
      target: runTarget(r.display_title),
    })),
    prs,
    merged: merged.filter((p) => p.kind === "module"),
  });
}
