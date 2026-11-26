/**
 * Shared feedback-module vocabulary — client-safe (web, native, server,
 * Payload). Tones are the design system's semantic tones (DESIGN-SYSTEM §5):
 * one tone map renders statuses, tags and changelog types everywhere.
 */

export const TONES = [
  "neutral",
  "info",
  "warning",
  "success",
  "destructive",
] as const;
export type Tone = (typeof TONES)[number];

/** Canny's status types: the initial status, in-progress ones, and the two ends. */
export const STATUS_TYPES = ["open", "active", "complete", "closed"] as const;
export type StatusType = (typeof STATUS_TYPES)[number];

export const BOARD_ACCESS = ["staff", "public", "members", "segment"] as const;
export type BoardAccess = (typeof BOARD_ACCESS)[number];

export const ANON_RULES = ["inherit", "allow", "deny"] as const;
export type AnonRule = (typeof ANON_RULES)[number];

export const SORTS = ["trending", "top", "new"] as const;
export type Sort = (typeof SORTS)[number];

export const VOTE_PRIORITIES = ["nice", "important", "must"] as const;
export type VotePriority = (typeof VOTE_PRIORITIES)[number];

export const VOTE_PRIORITY_LABELS: Record<VotePriority, string> = {
  nice: "Nice to have",
  important: "Important",
  must: "Must have",
};

/** Board slugs that would collide with the portal's own routes. */
export const RESERVED_BOARD_SLUGS = ["search", "create", "p", "new"] as const;

export interface StatusDefault {
  key: string;
  name: string;
  type: StatusType;
  tone: Tone;
  showOnRoadmap: boolean;
  isDefault: boolean;
  notifyVotersByDefault: boolean;
}

/** Canny's defaults: Open (initial), Under Review, Planned, In Progress, Complete, Closed. */
export const DEFAULT_STATUSES: StatusDefault[] = [
  {
    key: "open",
    name: "Open",
    type: "open",
    tone: "neutral",
    showOnRoadmap: false,
    isDefault: true,
    notifyVotersByDefault: false,
  },
  {
    key: "under-review",
    name: "Under Review",
    type: "active",
    tone: "info",
    showOnRoadmap: true,
    isDefault: false,
    notifyVotersByDefault: true,
  },
  {
    key: "planned",
    name: "Planned",
    type: "active",
    tone: "info",
    showOnRoadmap: true,
    isDefault: false,
    notifyVotersByDefault: true,
  },
  {
    key: "in-progress",
    name: "In Progress",
    type: "active",
    tone: "warning",
    showOnRoadmap: true,
    isDefault: false,
    notifyVotersByDefault: true,
  },
  {
    key: "complete",
    name: "Complete",
    type: "complete",
    tone: "success",
    showOnRoadmap: false,
    isDefault: false,
    notifyVotersByDefault: true,
  },
  {
    key: "closed",
    name: "Closed",
    type: "closed",
    tone: "destructive",
    showOnRoadmap: false,
    isDefault: false,
    notifyVotersByDefault: true,
  },
];

export const VOTE_MILESTONES = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

/** Lowercase, dash-separated, ≤ 80 chars — mirrors SQL mod_feedback_slugify. */
export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || "item";
}

/** The effective anonymous rule: a board's own rule, else the global default. */
export function effectiveAnon(
  rule: AnonRule | null | undefined,
  globalAllow: boolean,
): boolean {
  if (rule === "allow") return true;
  if (rule === "deny") return false;
  return globalAllow;
}
