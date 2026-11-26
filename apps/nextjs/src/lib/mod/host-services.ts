import "server-only";

import type { ModHostGithub, ModHostServices } from "@acme/mod-kit/server";

import { env } from "~/env";
import { isAllowedGithubPath } from "./host-services-core";
import { forgetGithubToken, siteGithubToken } from "./updates";

/**
 * Host services handed to module routes (`ctx.host`). GitHub goes through
 * the Meet Dream AI App's short-lived site token (updates.ts) — the same
 * credential /admin → Updates uses — and is fenced to the connected
 * repository's issue + label endpoints so a module can never push code or
 * start workflows with it.
 */

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
} as const;

const notConnected = (message: string) =>
  Response.json(
    { error: message, code: "github_not_connected" },
    { status: 503 },
  );

async function githubFetch(url: (repo: string) => string, init?: RequestInit) {
  const res = await siteGithubToken();
  if (res.status !== "ok" || !("token" in res)) {
    return notConnected(
      "message" in res
        ? res.message
        : "GitHub isn't connected. Connect it in /admin → Updates.",
    );
  }
  const response = await fetch(url(res.token.repo), {
    ...init,
    headers: {
      ...GITHUB_HEADERS,
      Authorization: `Bearer ${res.token.token}`,
      ...init?.headers,
    },
  });
  // The App was removed or the token revoked: mint a fresh one next time.
  if (response.status === 401) forgetGithubToken();
  return response;
}

const apiBase = () => env.DREAM_GITHUB_API_URL.replace(/\/$/, "");

export const hostGithub: ModHostGithub = {
  async status() {
    const res = await siteGithubToken();
    if (res.status === "ok" && "token" in res) {
      return { connected: true, repo: res.token.repo };
    }
    return {
      connected: false,
      reason: res.status,
      message:
        "message" in res
          ? res.message
          : "GitHub isn't connected. Connect it in /admin → Updates.",
    };
  },

  async api(path, init) {
    const method = (init?.method ?? "GET").toUpperCase();
    if (!isAllowedGithubPath(path, method)) {
      return Response.json(
        {
          error: `Modules may only call the connected repo's issue and label endpoints (got ${method} ${path || "/"}).`,
          code: "github_path_not_allowed",
        },
        { status: 403 },
      );
    }
    return githubFetch((repo) => `${apiBase()}/repos/${repo}${path}`, init);
  },

  async searchIssues(query, perPage = 10) {
    return githubFetch((repo) => {
      const q = `${query} repo:${repo} is:issue`.trim();
      return `${apiBase()}/search/issues?q=${encodeURIComponent(q)}&per_page=${Math.min(Math.max(perPage, 1), 50)}`;
    });
  },
};

export const hostServices: ModHostServices = { github: hostGithub };
