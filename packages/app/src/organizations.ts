import type { OrganizationMode } from "./auth-settings";

/** A membership as the app shell needs it (switcher, active org). */
export interface OrgSummary {
  id: string;
  name: string;
  website: string | null;
  isPersonal: boolean;
  role: "owner" | "admin" | "member";
}

/** Cookie (web) / storage key (native) holding the active organization id. */
export const ACTIVE_ORG_KEY = "dream-active-org";

/**
 * Where a signed-in, non-staff user must go before the app, given the
 * organization mode. `null` = carry on. Staff are routed by role elsewhere.
 */
export function resolveOrganizationGate(input: {
  isStaff: boolean;
  isAnonymous: boolean;
  mode: OrganizationMode;
  hasMembership: boolean;
}): "/onboarding/organization" | null {
  if (input.isStaff || input.isAnonymous) return null;
  if (input.mode === "required" && !input.hasMembership) {
    return "/onboarding/organization";
  }
  return null;
}

/**
 * The active organization: the stored choice if the user still belongs to
 * it, otherwise the oldest non-personal organization, otherwise the first.
 * `orgs` must be ordered oldest membership first.
 */
export function pickActiveOrg(
  orgs: OrgSummary[],
  storedId: string | null | undefined,
): OrgSummary | null {
  if (orgs.length === 0) return null;
  const stored = storedId ? orgs.find((o) => o.id === storedId) : undefined;
  return stored ?? orgs.find((o) => !o.isPersonal) ?? orgs[0] ?? null;
}
