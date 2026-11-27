import { describe, expect, it } from "vitest";

import type { DigestData } from "../src/server/digest";
import type { Insights } from "../src/shared/insights";
import { buildDigest, digestPeriod, hasActivity } from "../src/server/digest";

const totals = (posts: number, votes = 0): Insights["totals"] => ({
  posts: { current: posts, previous: 1 },
  votes: { current: votes, previous: 0 },
  comments: { current: 0, previous: 0 },
  voters: { current: 0, previous: 0 },
  shipped: { current: 0, previous: 0 },
});

const data = (over: Partial<DigestData> = {}): DigestData => ({
  cadence: "weekly",
  insights: {
    since: "",
    unit: "day",
    totals: totals(3, 5),
    series: [],
    byStatus: [],
    topPosts: [
      {
        id: "1",
        title: 'Dark <mode> & "themes"',
        slug: "dark-mode",
        boardId: "1",
        boardSlug: "feature-requests",
        statusId: null,
        gained: 4,
        votes: 9,
      },
    ],
    byBoard: [],
    bySource: [],
    medianDaysToFirstResponse: null,
    changelogReaders: 0,
  },
  pendingApproval: 2,
  stale: 0,
  autopilotPending: 1,
  newPosts: [],
  appName: "Acme",
  siteUrl: "https://app.example.com/",
  ...over,
});

describe("digestPeriod", () => {
  it("is daily every day and weekly only on Mondays", () => {
    const mon = new Date("2026-11-23T14:17:00Z");
    const tue = new Date("2026-11-24T14:17:00Z");
    expect(digestPeriod("daily", tue)).toBe("daily:2026-11-24");
    expect(digestPeriod("weekly", mon)).toBe("weekly:2026-11-23");
    expect(digestPeriod("weekly", tue)).toBeNull();
    expect(digestPeriod("never", mon)).toBeNull();
  });
});

describe("buildDigest", () => {
  it("summarizes totals, queues and top posts with escaped HTML", () => {
    const d = buildDigest(data());
    expect(d.subject).toBe("Acme feedback weekly digest: 3 new posts, 5 votes");
    expect(d.text).toContain("- New posts: 3 (+200%)");
    expect(d.text).toContain("- Waiting for approval: 2");
    expect(d.text).not.toContain("Stale in progress");
    expect(d.text).toContain(
      "https://app.example.com/feedback/feature-requests/p/dark-mode",
    );
    expect(d.html).toContain("Dark &#60;mode&#62; &#38; &#34;themes&#34;");
    expect(d.html).not.toContain("<mode>");
    expect(d.html).toContain('href="https://app.example.com/a/feedback"');
  });

  it("detects a quiet period", () => {
    const quiet = data({
      insights: { ...data().insights, totals: totals(0) },
      pendingApproval: 0,
      autopilotPending: 0,
    });
    expect(hasActivity(quiet)).toBe(false);
    expect(hasActivity(data())).toBe(true);
  });
});
