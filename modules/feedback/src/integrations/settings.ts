import type { FeedbackSettings } from "../payload/settings";
import type { ProviderSettings, StatusMappingRow } from "./types";

export const DEFAULT_GITHUB_MAPPING: StatusMappingRow[] = [
  { external: "unstarted", stage: "planned", direction: "both" },
  { external: "started", stage: "in-progress", direction: "both" },
  { external: "completed", stage: "shipped", direction: "both" },
  { external: "canceled", stage: "wont-do", direction: "both" },
];

/** GitHub provider settings from the module settings (with defaults). */
export function githubSettings(s: FeedbackSettings): ProviderSettings {
  const g = s.gh ?? {};
  return {
    enabled: g.enabled ?? true,
    statusMapping: g.map?.length
      ? g.map.map((r) => ({
          external: r.ext,
          stage: r.stage,
          direction: r.direction,
        }))
      : DEFAULT_GITHUB_MAPPING,
    inProgressLabels: g.inProgressLabels ?? ["in progress"],
    newIssueLabels: g.newIssueLabels ?? ["feedback"],
    backlinkComment: g.backlinkComment ?? true,
  };
}
