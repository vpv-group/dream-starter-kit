import { describe, expect, it } from "vitest";

import { DEFAULT_SOAK_HOURS, eligibleAt, isEligible } from "./eligibility";

const published = new Date("2026-12-01T00:00:00Z");
const hours = (h: number) => new Date(published.getTime() + h * 3_600_000);

describe("isEligible", () => {
  it("gives canary sites a release right away", () => {
    expect(
      isEligible({ publishedAt: published }, { canary: true }, hours(0)),
    ).toBe(true);
    expect(
      isEligible(
        { publishedAt: published, canaryOnly: true },
        { canary: true },
        hours(0),
      ),
    ).toBe(true);
  });

  it("makes everyone else wait out the default soak time", () => {
    expect(DEFAULT_SOAK_HOURS).toBe(72);
    expect(
      isEligible({ publishedAt: published }, { canary: false }, hours(71)),
    ).toBe(false);
    expect(
      isEligible({ publishedAt: published }, { canary: false }, hours(72)),
    ).toBe(true);
  });

  it("holds a canary-only release back from everyone else", () => {
    expect(
      isEligible(
        { publishedAt: published, canaryOnly: true },
        { canary: false },
        hours(1000),
      ),
    ).toBe(false);
  });

  it("lets a security release shorten the soak", () => {
    expect(
      isEligible(
        { publishedAt: published, soakHours: 0 },
        { canary: false },
        hours(0),
      ),
    ).toBe(true);
  });
});

describe("eligibleAt", () => {
  it("is the publish time plus the soak, or null when canary-only", () => {
    expect(eligibleAt({ publishedAt: published })?.toISOString()).toBe(
      "2026-12-04T00:00:00.000Z",
    );
    expect(eligibleAt({ publishedAt: published, canaryOnly: true })).toBeNull();
  });
});
