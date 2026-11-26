import { describe, expect, it } from "vitest";

import { postUrl, reachedMilestone } from "../src/server/notify";
import { createPostInput, statusInput, voteInput } from "../src/validators";

describe("vote milestones", () => {
  it("fires only on enabled milestones", () => {
    expect(reachedMilestone(10, ["10", "50"])).toBe(10);
    expect(reachedMilestone(25, ["10", "50"])).toBeNull();
    expect(reachedMilestone(11, ["10"])).toBeNull();
    expect(reachedMilestone(7, ["7"])).toBeNull(); // not a milestone at all
  });
});

describe("links + validators", () => {
  it("builds portal post URLs", () => {
    expect(postUrl({ boardSlug: "feature-requests", slug: "csv" })).toBe(
      "/feedback/feature-requests/p/csv",
    );
  });

  it("validates request bodies", () => {
    expect(voteInput.safeParse({ postId: "nope", voted: true }).success).toBe(
      false,
    );
    expect(
      createPostInput.safeParse({ boardId: "1", title: "ab" }).success,
    ).toBe(false);
    const ok = createPostInput.parse({ boardId: "1", title: "  Dark mode  " });
    expect(ok.title).toBe("Dark mode");
    expect(ok.details).toBe("");
    expect(
      statusInput.parse({
        postId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
        statusId: "planned",
      }).notify,
    ).toBe(true);
  });
});
