import { describe, expect, it } from "vitest";

import type { ScoreFactor } from "../src/shared/score";
import { ideaStageRows } from "../src/server/config-sync";
import {
  DEFAULT_IDEA_STAGES,
  DEFAULT_SCORE_FACTORS,
  scoreIdea,
} from "../src/shared/score";

const stats = {
  voters: 12,
  must: 2,
  important: 3,
  nice: 1,
  tags: { Pro: 4, Team: 1 },
};

describe("idea score (Canny Ideas)", () => {
  it("impact ÷ effort with the default factors", () => {
    // votes 12×1 + impact 8×1 = 20, effort 5×1 → 4
    expect(
      scoreIdea(DEFAULT_SCORE_FACTORS, { impact: 8, effort: 5 }, stats),
    ).toBe(4);
  });

  it("no effort → raw impact; unset manual factors count 0", () => {
    expect(scoreIdea(DEFAULT_SCORE_FACTORS, {}, stats)).toBe(12);
  });

  it("weight 0 shows a factor without counting it", () => {
    const factors: ScoreFactor[] = [
      {
        key: "votes",
        name: "Votes",
        kind: "impact",
        scale: "number",
        source: "votes",
        weight: 0,
      },
      {
        key: "rev",
        name: "Revenue",
        kind: "impact",
        scale: "number",
        source: "manual",
        weight: 2,
      },
    ];
    expect(scoreIdea(factors, { rev: 10 }, stats)).toBe(20);
  });

  it("priority, tag voters, checkbox and percentage factors", () => {
    const factors: ScoreFactor[] = [
      {
        key: "prio",
        name: "Priority",
        kind: "impact",
        scale: "number",
        source: "priority",
        weight: 1,
      },
      {
        key: "paid",
        name: "Paying",
        kind: "impact",
        scale: "number",
        source: "tagVoters",
        tags: ["Pro", "Team"],
        weight: 1,
      },
      {
        key: "strategic",
        name: "Strategic",
        kind: "impact",
        scale: "checkbox",
        source: "manual",
        weight: 10,
      },
      {
        key: "conf",
        name: "Confidence",
        kind: "impact",
        scale: "percentage",
        source: "manual",
        weight: 10,
      },
    ];
    // priority 2×3+3×2+1 = 13, paying 5, strategic 10, confidence 0.5×10 = 5
    expect(scoreIdea(factors, { strategic: true, conf: 50 }, stats)).toBe(33);
  });
});

describe("idea stage copy", () => {
  it("keeps a portal status only when it exists", () => {
    const rows = ideaStageRows(
      DEFAULT_IDEA_STAGES,
      new Set(["planned", "complete"]),
    );
    const byId = Object.fromEntries(
      rows.map((r) => [r.id, r.portal_status_id]),
    );
    expect(byId.planned).toBe("planned");
    expect(byId.shipped).toBe("complete");
    expect(byId["in-progress"]).toBeNull(); // unknown status → leave posts alone
    expect(byId.backlog).toBeNull();
  });
});
