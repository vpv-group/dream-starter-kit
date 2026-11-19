/**
 * Cross-platform workspace (B2B) rules: slug format + reserved words, the
 * onboarding step registry, and the copy helpers that substitute the founder's
 * `workspaceLabel`. Web and Expo share this so validation and step order never
 * drift. The database enforces the same slug rules (see
 * supabase/migrations/20261118000000_workspaces.sql → is_reserved_slug and the
 * organizations_slug_* constraints); keep the two lists in sync.
 */
import type { AuthSettings, BuiltInOnboardingStep } from "./auth-settings";

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/** 2–39 chars, lowercase letters/digits, single inner hyphens. */
export const WORKSPACE_SLUG_RE = /^[a-z0-9](-?[a-z0-9]){1,38}$/;
export const WORKSPACE_SLUG_MAX = 39;

/** Slugs that collide with app routes. Mirrors public.is_reserved_slug(). */
export const RESERVED_WORKSPACE_SLUGS: readonly string[] = [
  "a",
  "admin",
  "api",
  "auth",
  "billing",
  "cms-api",
  "cms-setup",
  "invite",
  "join",
  "mcp",
  "oauth",
  "onboarding",
  "pricing",
  "profile",
  "sign-in",
  "sign-up",
  "welcome",
  "w",
  "www",
];

export type SlugProblem = "empty" | "format" | "reserved";

/** Client-side slug check (uniqueness is the server's job: is_slug_available). */
export function validateWorkspaceSlug(
  slug: string,
): { ok: true } | { ok: false; problem: SlugProblem } {
  if (slug.length === 0) return { ok: false, problem: "empty" };
  if (!WORKSPACE_SLUG_RE.test(slug)) return { ok: false, problem: "format" };
  if (RESERVED_WORKSPACE_SLUGS.includes(slug)) {
    return { ok: false, problem: "reserved" };
  }
  return { ok: true };
}

/**
 * Derive a slug from a workspace name: lowercase ASCII, diacritics stripped,
 * runs of anything else collapsed to one hyphen, trimmed to 39 chars. Returns
 * "" when nothing usable is left (the user then types one).
 */
export function slugifyWorkspaceName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cut = base.slice(0, WORKSPACE_SLUG_MAX).replace(/-+$/g, "");
  return cut.length >= 2 ? cut : "";
}

/** Normalize what a user types into the slug field (lowercase, no spaces). */
export function normalizeSlugInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, WORKSPACE_SLUG_MAX);
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** "Workspace" → "workspace" for mid-sentence use. */
export function labelLower(label: string): string {
  return label.toLowerCase();
}

/** The article for a label in running text ("a workspace", "an organization"). */
export function labelWithArticle(label: string): string {
  const lower = labelLower(label);
  return /^[aeiou]/.test(lower) ? `an ${lower}` : `a ${lower}`;
}

export function slugProblemMessage(problem: SlugProblem): string {
  switch (problem) {
    case "empty":
      return "Choose a URL.";
    case "format":
      return "Use 2–39 lowercase letters, numbers or single hyphens.";
    case "reserved":
      return "That URL is reserved. Try another.";
  }
}

/**
 * Map an RPC error (the stable snake_case messages raised by the workspace
 * functions) to user-facing copy. Unknown errors get a generic message.
 */
export function workspaceErrorMessage(
  error: { message?: string } | null | undefined,
  label = "Workspace",
): string {
  const code = error?.message ?? "";
  const lower = labelLower(label);
  switch (code) {
    case "invalid_name":
      return "Enter a name between 1 and 64 characters.";
    case "invalid_slug":
      return slugProblemMessage("format");
    case "slug_unavailable":
      return "That URL is taken. Try another.";
    case "not_allowed":
      return `Sign in with a confirmed email to use ${labelWithArticle(lower)}.`;
    case "not_a_member":
      return `You're not a member of that ${lower}.`;
    case "invite_not_found":
      return "This invite link isn't valid.";
    case "invite_expired":
      return "This invite has expired.";
    case "invite_revoked":
      return "This invite was revoked.";
    case "invite_used":
      return "This invite was already used.";
    case "invite_wrong_account":
      return "This invite was sent to a different email.";
    case "join_link_invalid":
      return "This join link isn't valid.";
    case "join_link_disabled":
      return "This join link was turned off.";
    case "join_domain_not_allowed":
      return `Your email domain can't join this ${lower}.`;
    case "last_owner":
      return `Transfer ownership before leaving this ${lower}.`;
    default:
      return "Something went wrong. Please try again.";
  }
}

// ---------------------------------------------------------------------------
// Onboarding step registry
// ---------------------------------------------------------------------------

export interface OnboardingStepDef {
  key: BuiltInOnboardingStep;
  /** Route under the (onboarding) group. */
  path: string;
  /** Checklist title on /a. */
  title: string;
  /** Only workspace owners/admins see it (e.g. invite teammates). */
  adminOnly: boolean;
  /** Shown to people who joined an existing workspace (invitees). */
  forInvitees: boolean;
  /**
   * Whether this build ships a screen for it. `integrations` renders
   * module-contributed steps and `plan` workspace billing (PR 3). Unavailable steps are skipped silently,
   * even when enabled in the settings.
   */
  available: boolean;
}

export const ONBOARDING_STEP_DEFS: Record<
  BuiltInOnboardingStep,
  OnboardingStepDef
> = {
  profile: {
    key: "profile",
    path: "/onboarding/profile",
    title: "Set up your profile",
    adminOnly: false,
    forInvitees: true,
    available: true,
  },
  invite: {
    key: "invite",
    path: "/onboarding/invite",
    title: "Invite your team",
    adminOnly: true,
    forInvitees: false,
    available: true,
  },
  integrations: {
    key: "integrations",
    path: "/onboarding/connect",
    title: "Connect your apps",
    adminOnly: false,
    forInvitees: false,
    available: false,
  },
  updates: {
    key: "updates",
    path: "/onboarding/updates",
    title: "Stay in the loop",
    adminOnly: false,
    forInvitees: true,
    available: true,
  },
  plan: {
    key: "plan",
    path: "/onboarding/plan",
    title: "Choose a plan",
    adminOnly: true,
    forInvitees: false,
    available: false,
  },
};

const isBuiltIn = (key: string): key is BuiltInOnboardingStep =>
  Object.prototype.hasOwnProperty.call(ONBOARDING_STEP_DEFS, key);

export interface OnboardingAudience {
  /** Owner/admin of the workspace (memberships.role). */
  isAdmin: boolean;
  /** Joined an existing workspace (did not create it). */
  isInvitee: boolean;
}

/**
 * The steps this person walks through, in the founder's order: enabled in
 * settings, shipped in this build, and meant for this audience.
 */
export function activeOnboardingSteps(
  settings: Pick<AuthSettings, "onboardingSteps">,
  audience: OnboardingAudience,
): OnboardingStepDef[] {
  const out: OnboardingStepDef[] = [];
  for (const row of settings.onboardingSteps) {
    if (!row.enabled || !isBuiltIn(row.step)) continue;
    const def = ONBOARDING_STEP_DEFS[row.step];
    if (!def.available) continue;
    if (def.adminOnly && !audience.isAdmin) continue;
    if (audience.isInvitee && !def.forInvitees) continue;
    out.push(def);
  }
  return out;
}

/** The step after `current`, or null when `current` is the last one. */
export function nextOnboardingStep(
  steps: readonly OnboardingStepDef[],
  current: string,
): OnboardingStepDef | null {
  const i = steps.findIndex((s) => s.key === current);
  if (i < 0) return steps[0] ?? null;
  return steps[i + 1] ?? null;
}

/** "Step 02 / 04" eyebrow parts (1-based, zero-padded). */
export function stepEyebrow(
  steps: readonly OnboardingStepDef[],
  current: string,
): { index: string; total: string } | null {
  const i = steps.findIndex((s) => s.key === current);
  if (i < 0) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { index: pad(i + 1), total: pad(steps.length) };
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/** Free-mail domains can't restrict an invite link. Mirrors public.is_free_mail_domain(). */
export const FREE_MAIL_DOMAINS: readonly string[] = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "mail.com",
  "yandex.com",
  "zoho.com",
  "hey.com",
  "fastmail.com",
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** Max addresses per invite request (mirrors create_invitations). */
export const MAX_INVITES_PER_REQUEST = 50;

/**
 * Split pasted text into distinct, lower-cased addresses (commas, semicolons,
 * whitespace and newlines all separate). "Name <a@b.com>" keeps the address.
 */
export function parseEmailList(input: string): {
  valid: string[];
  invalid: string[];
} {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  // "Ana Lopez <ana@x.com>" → "ana@x.com" before splitting on separators.
  const flattened = input.replace(/[^,;\n<>@]*<([^<>]+)>/g, " $1 ");
  for (const raw of flattened.split(/[\s,;]+/)) {
    const candidate = raw.trim().toLowerCase();
    if (!candidate) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    (EMAIL_RE.test(candidate) ? valid : invalid).push(candidate);
  }
  return { valid, invalid };
}

/** Normalize + validate a domain list for invite-link restrictions. */
export function parseAllowedDomains(
  input: string,
): { ok: true; domains: string[] } | { ok: false; error: string } {
  const domains = [
    ...new Set(
      input
        .split(/[\s,;]+/)
        .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean),
    ),
  ];
  for (const d of domains) {
    if (!DOMAIN_RE.test(d)) return { ok: false, error: `${d} isn't a domain.` };
    if (FREE_MAIL_DOMAINS.includes(d)) {
      return {
        ok: false,
        error: `${d} is a free email provider, so anyone could join.`,
      };
    }
  }
  return { ok: true, domains };
}

/** Per-address outcome of an invite request (POST /api/workspaces/:id/invitations). */
export type InviteResult =
  | "sent"
  | "existing_account"
  | "already_member"
  | "invalid"
  | "rate_limited"
  | "send_failed";

export function inviteResultLabel(result: InviteResult): string {
  switch (result) {
    case "sent":
      return "Invite sent";
    case "existing_account":
      return "Has an account — they'll see it when they sign in";
    case "already_member":
      return "Already a member";
    case "invalid":
      return "Not a valid email";
    case "rate_limited":
      return "Daily invite limit reached";
    case "send_failed":
      return "Couldn't send the email";
  }
}

/** The /invite/{token} and /join/{token} page states. */
export type InviteProblemKind =
  | "expired"
  | "revoked"
  | "used"
  | "not_found"
  | "wrong_account"
  | "disabled"
  | "domain";

/** Map an RPC error code (accept_invitation / join_workspace_by_link) to a page state. */
export function inviteProblemFromCode(
  code: string | null | undefined,
): InviteProblemKind | null {
  switch (code) {
    case "invite_expired":
      return "expired";
    case "invite_revoked":
      return "revoked";
    case "invite_used":
      return "used";
    case "invite_wrong_account":
      return "wrong_account";
    case "join_link_disabled":
      return "disabled";
    case "join_domain_not_allowed":
      return "domain";
    case "invite_not_found":
    case "join_link_invalid":
    case "not_allowed":
      return "not_found";
    default:
      return null;
  }
}
