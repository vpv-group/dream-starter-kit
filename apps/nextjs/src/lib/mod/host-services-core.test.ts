import { describe, expect, it } from "vitest";

import { isAllowedGithubPath } from "./host-services-core";

describe("isAllowedGithubPath", () => {
  it("allows issue and label endpoints with any method", () => {
    expect(isAllowedGithubPath("/issues", "POST")).toBe(true);
    expect(isAllowedGithubPath("/issues/12", "PATCH")).toBe(true);
    expect(isAllowedGithubPath("/issues/12/comments", "POST")).toBe(true);
    expect(isAllowedGithubPath("/issues?state=all&since=x", "GET")).toBe(true);
    expect(isAllowedGithubPath("/labels", "GET")).toBe(true);
  });

  it("allows reading the repo itself only with GET", () => {
    expect(isAllowedGithubPath("", "GET")).toBe(true);
    expect(isAllowedGithubPath("", "PATCH")).toBe(false);
  });

  it("refuses everything else", () => {
    expect(isAllowedGithubPath("/contents/README.md", "PUT")).toBe(false);
    expect(isAllowedGithubPath("/actions/workflows/x/dispatches", "POST")).toBe(
      false,
    );
    expect(isAllowedGithubPath("/pulls", "GET")).toBe(false);
    expect(isAllowedGithubPath("/issuesx", "GET")).toBe(false);
    expect(isAllowedGithubPath("/issues/../pulls", "GET")).toBe(false);
  });
});
