/**
 * Pure rules for the module host services (host-services.ts) — kept free of
 * env/server imports so they unit-test without a backend.
 */

/**
 * Repo-relative GitHub paths a module may call through `ctx.host.github.api`:
 * the connected repo's issue + label endpoints (any method), and the repo
 * itself (`""`, GET only). Everything else — contents, actions, pulls — is
 * refused, so a module can never push code or start workflows.
 */
export function isAllowedGithubPath(path: string, method: string): boolean {
  if (path.includes("..")) return false;
  if (path === "" || path.startsWith("?"))
    return method.toUpperCase() === "GET";
  return /^\/(issues|labels)(\/|\?|$)/.test(path);
}
