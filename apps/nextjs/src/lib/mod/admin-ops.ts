import "server-only";

import { env } from "~/env";
import { createClient } from "~/lib/supabase/server";
import { forgetGithubToken, siteGithubToken } from "./updates";

/**
 * Shared plumbing for the /api/modules/* admin routes (docs/
 * MODULES-PLAN.md §6): staff/admin gating via the caller's Supabase
 * session + profile, and the GitHub client for module-ops.yml, signed in
 * through Dream Updates (updates.ts) — no personal token anywhere.
 * The deployed app can't run git/pnpm, so every mutation dispatches the
 * workflow, which runs the real CLI and opens a PR.
 */

export async function requireAdmin(): Promise<
  { ok: true } | { ok: false; res: Response }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      res: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_staff")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_staff) {
    return {
      ok: false,
      res: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true };
}

/**
 * Is GitHub connected (the Dream Updates App, /admin → Updates)? Without
 * it nothing runs: no update PRs, no installs from /admin.
 */
export async function githubConnected(): Promise<boolean> {
  return (await siteGithubToken()).status === "ok";
}

/**
 * Paid modules (`dream:<slug>`) install through module-ops.yml, which needs
 * GitHub connected; the registry then checks this site's entitlements.
 */
export async function paidModulesEnabled(): Promise<boolean> {
  return await githubConnected();
}

export const PAID_MODULES_DISABLED = {
  error:
    "Connect GitHub in /admin → Updates first: modules install through a pull request.",
  code: "github_not_connected",
} as const;

/**
 * The GitHub REST API for the connected repository, with the short-lived
 * Dream Updates token (it can start module-ops.yml and read PRs and runs,
 * never push code). 503 with a reason when GitHub isn't connected.
 */
export async function githubApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await siteGithubToken();
  if (res.status !== "ok" || !("token" in res)) {
    return Response.json(
      {
        error:
          "message" in res
            ? res.message
            : "GitHub isn't connected. Connect it in /admin → Updates.",
        code: "github_not_connected",
      },
      { status: 503 },
    );
  }
  const response = await fetch(
    `${env.DREAM_GITHUB_API_URL.replace(/\/$/, "")}/repos/${res.token.repo}${path}`,
    {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${res.token.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...init?.headers,
      },
    },
  );
  // The App was removed or the token revoked: mint a fresh one next time.
  if (response.status === 401) forgetGithubToken();
  return response;
}
