import { describe, expect, it } from "vitest";

import { detectHost } from "./host";

describe("detectHost", () => {
  it("reads Vercel's environment and repository", () => {
    expect(
      detectHost({
        VERCEL_ENV: "preview",
        VERCEL_GIT_REPO_OWNER: "acme",
        VERCEL_GIT_REPO_SLUG: "app",
      }),
    ).toEqual({ id: "vercel", environment: "preview", repo: "acme/app" });
  });

  it("falls back to a plain Node host that knows nothing", () => {
    expect(detectHost({})).toEqual({
      id: "node",
      environment: null,
      repo: null,
    });
  });
});
