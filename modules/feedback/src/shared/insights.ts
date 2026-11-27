/** Shape returned by `mod_feedback_insights()` (006_insights.sql). */
export interface InsightsTotal {
  current: number;
  previous: number;
}

export interface Insights {
  since: string;
  unit: "day" | "week";
  totals: Record<
    "posts" | "votes" | "comments" | "voters" | "shipped",
    InsightsTotal
  >;
  series: { bucket: string; posts: number; votes: number; comments: number }[];
  byStatus: {
    id: string;
    name: string;
    type: string;
    tone: string;
    count: number;
  }[];
  topPosts: {
    id: string;
    title: string;
    slug: string;
    boardId: string;
    boardSlug: string;
    statusId: string | null;
    gained: number;
    votes: number;
  }[];
  byBoard: { id: string; name: string; count: number }[];
  bySource: { source: string; count: number }[];
  medianDaysToFirstResponse: number | null;
  changelogReaders: number;
}

/** Percent change, or null when there's no baseline. */
export function delta(t: InsightsTotal): number | null {
  if (t.previous === 0) return t.current === 0 ? 0 : null;
  return Math.round(((t.current - t.previous) / t.previous) * 100);
}

export const SOURCE_LABELS: Record<string, string> = {
  portal: "Portal",
  staff: "Staff",
  api: "Inbound API",
  chat: "Chat",
  widget: "Widget",
};
