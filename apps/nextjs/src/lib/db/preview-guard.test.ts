import { describe, expect, it } from "vitest";

import { isGuardedPreview } from "./preview-guard";

describe("isGuardedPreview", () => {
  it("guards Vercel preview deployments by default", () => {
    expect(isGuardedPreview({ VERCEL_ENV: "preview" })).toBe(true);
    expect(
      isGuardedPreview({ VERCEL_ENV: "preview", DB_BOOTSTRAP: "off" }),
    ).toBe(true);
  });

  it("lets a preview with its own database opt in with DB_BOOTSTRAP=on", () => {
    expect(
      isGuardedPreview({ VERCEL_ENV: "preview", DB_BOOTSTRAP: "on" }),
    ).toBe(false);
  });

  it("never guards production, development or non-Vercel hosts", () => {
    expect(isGuardedPreview({ VERCEL_ENV: "production" })).toBe(false);
    expect(isGuardedPreview({ VERCEL_ENV: "development" })).toBe(false);
    expect(isGuardedPreview({})).toBe(false);
  });
});
