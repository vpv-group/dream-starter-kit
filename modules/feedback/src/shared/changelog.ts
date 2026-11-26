import type { Tone } from "./config";

/** Canny's three changelog entry types, with their tones. */
export const CHANGELOG_TYPES = ["new", "improved", "fixed"] as const;
export type ChangelogType = (typeof CHANGELOG_TYPES)[number];

export const CHANGELOG_TYPE_META: Record<
  ChangelogType,
  { label: string; tone: Tone }
> = {
  new: { label: "New", tone: "success" },
  improved: { label: "Improved", tone: "info" },
  fixed: { label: "Fixed", tone: "warning" },
};
