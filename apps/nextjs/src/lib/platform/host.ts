/**
 * Where this deployment runs (docs/MODULES.md → Automatic updates). Pure —
 * takes the env, so host.test.ts pins it. Only Vercel is detected today; any
 * other host is "node" and states what it knows through explicit env.
 * Adding a host (Cloudflare, AWS) means another branch here, not changes in
 * the callers.
 */

export interface HostEnv {
  VERCEL_ENV?: string;
  VERCEL_GIT_REPO_OWNER?: string;
  VERCEL_GIT_REPO_SLUG?: string;
}

export interface Host {
  id: "vercel" | "node";
  /** production | preview | development (null when unknown). */
  environment: "production" | "preview" | "development" | null;
  /** owner/repo of the source repository, when the host says. */
  repo: string | null;
}

export function detectHost(env: HostEnv): Host {
  if (env.VERCEL_ENV) {
    const environment =
      env.VERCEL_ENV === "production" ||
      env.VERCEL_ENV === "preview" ||
      env.VERCEL_ENV === "development"
        ? env.VERCEL_ENV
        : null;
    const repo =
      env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG
        ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`
        : null;
    return { id: "vercel", environment, repo };
  }
  return { id: "node", environment: null, repo: null };
}
