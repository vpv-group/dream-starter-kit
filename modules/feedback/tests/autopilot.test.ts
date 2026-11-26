import { describe, expect, it } from "vitest";

import { autopilotSettings, pickDuplicate } from "../src/server/autopilot";

describe("pickDuplicate", () => {
  const now = "2026-11-26T12:00:00Z";
  it("picks the most similar older post over the threshold", () => {
    const picked = pickDuplicate(
      [
        { id: "a", similarity: 0.9, created_at: "2026-11-01T00:00:00Z" },
        { id: "b", similarity: 0.95, created_at: "2026-11-02T00:00:00Z" },
        { id: "c", similarity: 0.5, created_at: "2026-11-03T00:00:00Z" },
      ],
      0.86,
      now,
    );
    expect(picked?.id).toBe("b");
  });

  it("prefers the oldest post on a tie", () => {
    const picked = pickDuplicate(
      [
        { id: "copy", similarity: 1, created_at: "2026-11-02T00:00:00Z" },
        { id: "original", similarity: 1, created_at: "2026-11-01T00:00:00Z" },
      ],
      0.86,
      now,
    );
    expect(picked?.id).toBe("original");
  });

  it("never suggests a newer post as the original", () => {
    expect(
      pickDuplicate(
        [{ id: "n", similarity: 0.99, created_at: "2026-11-27T00:00:00Z" }],
        0.86,
        now,
      ),
    ).toBeNull();
  });

  it("returns null under the threshold", () => {
    expect(pickDuplicate([{ id: "x", similarity: 0.8 }], 0.86, now)).toBeNull();
  });
});

describe("autopilotSettings", () => {
  it("defaults to manual review with dedupe on and replies off", () => {
    const s = autopilotSettings(undefined);
    expect(s).toMatchObject({
      enabled: true,
      actions: "manual",
      dedupe: true,
      replies: false,
      replyAs: null,
      threshold: 0.86,
    });
  });

  it("ignores junk values", () => {
    const s = autopilotSettings({
      actions: "yolo",
      threshold: "high",
      apiBoard: "",
    });
    expect(s.actions).toBe("manual");
    expect(s.threshold).toBe(0.86);
    expect(s.apiBoard).toBe("feature-requests");
  });
});
