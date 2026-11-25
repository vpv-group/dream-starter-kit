import { z } from "zod/v4";

import type { GithubPr } from "~/lib/mod/ops-core";
import {
  githubApi,
  PAID_MODULES_DISABLED,
  paidModulesEnabled,
  requireAdmin,
} from "~/lib/mod/admin-ops";
import { dispatchBody, toOpsPrs } from "~/lib/mod/ops-core";
import { isPaidOp } from "~/lib/mod/paid-ops";

/**
 * Module operations (docs/MODULES-PLAN.md §6): every mutation dispatches
 * .github/workflows/module-ops.yml, which runs the real `pnpm mod` CLI on a
 * runner and opens a labeled PR — installed/updated code is always reviewed as
 * a diff and gated by CI before it can run. `kit-update` runs the workflow's
 * Dream Starter Kit check now instead of waiting for the daily schedule.
 * GET lists in-flight runs plus open module and kit update PRs.
 */

const opSchema = z.object({
  op: z.enum(["add", "update", "remove", "kit-update"]),
  /** add: github url (#vX.Y.Z ok) or a signed zip URL; update/remove: unused. */
  source: z.string().optional(),
  slug: z.string().optional(),
  version: z.string().optional(),
  keepData: z.boolean().optional(),
  /** zip installs: sha256 the runner re-verifies after download. */
  sha256: z.string().optional(),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const parsed = opSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid op" }, { status: 400 });
  }
  const { op, source, slug, version, keepData, sha256 } = parsed.data;
  if (isPaidOp({ op, source, slug }) && !paidModulesEnabled()) {
    return Response.json(PAID_MODULES_DISABLED, { status: 403 });
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
        { op, source, slug, version, keepData, sha256 },
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

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const [runsRes, prsRes] = await Promise.all([
    githubApi("/actions/workflows/module-ops.yml/runs?per_page=10"),
    githubApi("/pulls?state=open&per_page=20"),
  ]);
  if (runsRes.status === 503) return runsRes;

  const runs = runsRes.ok
    ? ((await runsRes.json()) as {
        workflow_runs?: {
          id: number;
          status: string;
          conclusion: string | null;
          html_url: string;
          created_at: string;
          display_title: string;
        }[];
      })
    : { workflow_runs: [] };
  const prs = prsRes.ok ? ((await prsRes.json()) as GithubPr[]) : [];

  return Response.json({
    runs: (runs.workflow_runs ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      conclusion: r.conclusion,
      url: r.html_url,
      createdAt: r.created_at,
      title: r.display_title,
    })),
    prs: toOpsPrs(prs),
  });
}
