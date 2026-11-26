/**
 * Idea scoring (Canny's Ideas "Score"): Σ(weight × value) over impact
 * factors ÷ Σ(weight × value) over effort factors; with no effort the raw
 * impact is the score. Checkbox factors count 1/0, unset factors 0, and a
 * weight of 0 shows a factor without counting it. Pure — shared by the staff
 * table, the kanban and tests.
 */

export const FACTOR_SCALES = [
  "0-10",
  "0-100",
  "fibonacci",
  "stars",
  "checkbox",
  "percentage",
  "number",
] as const;
export type FactorScale = (typeof FACTOR_SCALES)[number];

export const FACTOR_SOURCES = [
  "manual",
  "votes",
  "priority",
  "tagVoters",
] as const;
export type FactorSource = (typeof FACTOR_SOURCES)[number];

export interface ScoreFactor {
  key: string;
  name: string;
  kind: "impact" | "effort";
  scale: FactorScale;
  source: FactorSource;
  /** tagVoters: voters carrying any of these user tags (e.g. paid plans). */
  tags?: string[] | null;
  weight: number;
}

export interface IdeaVoterStats {
  voters: number;
  must: number;
  important: number;
  nice: number;
  /** user tag name → voters with it */
  tags: Record<string, number>;
}

export const FIBONACCI = [1, 2, 3, 5, 8, 13, 21] as const;

/** The value a factor contributes for one idea (before weighting). */
export function factorValue(
  factor: ScoreFactor,
  manual: Record<string, number | boolean | null | undefined>,
  stats: IdeaVoterStats | undefined,
): number {
  switch (factor.source) {
    case "votes":
      return stats?.voters ?? 0;
    case "priority":
      // Must have counts 3, Important 2, Nice to have 1 (Canny's vote priority).
      return (
        (stats?.must ?? 0) * 3 +
        (stats?.important ?? 0) * 2 +
        (stats?.nice ?? 0)
      );
    case "tagVoters":
      return (factor.tags ?? []).reduce((n, t) => n + (stats?.tags[t] ?? 0), 0);
    case "manual": {
      const raw = manual[factor.key];
      if (factor.scale === "checkbox") return raw ? 1 : 0;
      const n = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
      return factor.scale === "percentage" ? n / 100 : n;
    }
  }
}

export function scoreIdea(
  factors: ScoreFactor[],
  manual: Record<string, number | boolean | null | undefined>,
  stats: IdeaVoterStats | undefined,
): number {
  let impact = 0;
  let effort = 0;
  for (const f of factors) {
    const v = f.weight * factorValue(f, manual, stats);
    if (f.kind === "effort") effort += v;
    else impact += v;
  }
  const score = effort > 0 ? impact / effort : impact;
  return Math.round(score * 100) / 100;
}

export const DEFAULT_SCORE_FACTORS: ScoreFactor[] = [
  {
    key: "votes",
    name: "Votes",
    kind: "impact",
    scale: "number",
    source: "votes",
    weight: 1,
  },
  {
    key: "impact",
    name: "Impact",
    kind: "impact",
    scale: "0-10",
    source: "manual",
    weight: 1,
  },
  {
    key: "effort",
    name: "Effort",
    kind: "effort",
    scale: "fibonacci",
    source: "manual",
    weight: 1,
  },
];

export interface IdeaStageDefault {
  key: string;
  name: string;
  type: "open" | "active" | "complete" | "closed";
  tone: "neutral" | "info" | "warning" | "success" | "destructive";
  portalStatus: string | null;
  notifyVoters: boolean;
}

/** Canny-style idea stages mapped to the default portal statuses. */
export const DEFAULT_IDEA_STAGES: IdeaStageDefault[] = [
  {
    key: "backlog",
    name: "Backlog",
    type: "open",
    tone: "neutral",
    portalStatus: null,
    notifyVoters: false,
  },
  {
    key: "under-review",
    name: "Under Review",
    type: "active",
    tone: "info",
    portalStatus: "under-review",
    notifyVoters: true,
  },
  {
    key: "planned",
    name: "Planned",
    type: "active",
    tone: "info",
    portalStatus: "planned",
    notifyVoters: true,
  },
  {
    key: "in-progress",
    name: "In Progress",
    type: "active",
    tone: "warning",
    portalStatus: "in-progress",
    notifyVoters: true,
  },
  {
    key: "shipped",
    name: "Shipped",
    type: "complete",
    tone: "success",
    portalStatus: "complete",
    notifyVoters: true,
  },
  {
    key: "wont-do",
    name: "Won't do",
    type: "closed",
    tone: "destructive",
    portalStatus: "closed",
    notifyVoters: true,
  },
];
