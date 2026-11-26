import type { Env } from "../registry-auth";
import type { PrMeta } from "./pr-meta";
import { actionsOidcToken, registryAudience } from "../registry-auth";

/**
 * Tell Meet Dream what happened to an update PR (`POST /ops/report`). It
 * feeds the fleet-wide per-release hold, and a failed deploy pauses this
 * site's automatic merging. Best effort: a report that can't be sent never
 * fails the job.
 */

export type ReportEvent =
  | "merged"
  | "merge_failed"
  | "checks_failed"
  | "conflicts"
  | "deploy_ok"
  | "deploy_failed"
  | "reverted"
  // Green, but waiting for the owner's review (counts as a success).
  | "ready"
  // Checks failed, but they were already failing on the base branch, so the
  // update isn't to blame (never counted against the release).
  | "checks_failed_base_red";

export function reporter(
  registry: string,
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
  log: (line: string) => void = () => undefined,
) {
  return async (
    event: ReportEvent,
    meta: PrMeta,
    pr: number,
    detail?: string,
  ): Promise<void> => {
    try {
      const oidc = await actionsOidcToken(
        registryAudience(registry),
        env,
        fetchImpl,
      );
      if (!oidc) return;
      const res = await fetchImpl(`${registry.replace(/\/$/, "")}/ops/report`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${oidc}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event,
          target: meta.slug,
          version: meta.to ?? "unknown",
          pr,
          ...(detail ? { detail: detail.slice(0, 300) } : {}),
        }),
      });
      if (!res.ok)
        log(`report ${event} for #${pr} refused (HTTP ${res.status})`);
    } catch (err) {
      log(`report ${event} for #${pr} failed: ${(err as Error).message}`);
    }
  };
}
