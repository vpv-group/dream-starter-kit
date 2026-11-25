/**
 * Release eligibility for automatic merging (soak time + canary rollout).
 *
 * A new kit or module release reaches our own canary sites first and
 * immediately; everyone else gets it automatically only after it has been
 * published for the soak time (72 h by default), unless it is marked
 * canary-only (held back after canary failures) or is a security release
 * with a shorter soak. Pure — eligibility.test.ts pins it; the registry
 * computes the same answer for `ops/session` once R3 ships.
 */

export const DEFAULT_SOAK_HOURS = 72;

export interface ReleaseFacts {
  publishedAt: Date;
  /** Released to canary sites only (e.g. canary update PRs failed). */
  canaryOnly?: boolean;
  /** Soak override, e.g. a security fix (0 = right away). */
  soakHours?: number;
}

export function isEligible(
  release: ReleaseFacts,
  site: { canary: boolean },
  now: Date,
): boolean {
  if (site.canary) return true;
  if (release.canaryOnly) return false;
  const soakMs = (release.soakHours ?? DEFAULT_SOAK_HOURS) * 3_600_000;
  return now.getTime() - release.publishedAt.getTime() >= soakMs;
}

/** When a non-canary site becomes eligible (null when held to canary). */
export function eligibleAt(release: ReleaseFacts): Date | null {
  if (release.canaryOnly) return null;
  const soakMs = (release.soakHours ?? DEFAULT_SOAK_HOURS) * 3_600_000;
  return new Date(release.publishedAt.getTime() + soakMs);
}
