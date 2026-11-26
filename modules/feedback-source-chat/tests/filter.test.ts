import { describe, expect, it } from "vitest";

import {
  DEFAULT_KEYWORDS,
  looksLikeFeedback,
  parseKeywords,
} from "../src/server/filter";

describe("looksLikeFeedback", () => {
  it("keeps messages with a feedback phrase", () => {
    expect(
      looksLikeFeedback(
        "It would be nice to export reports as CSV",
        DEFAULT_KEYWORDS,
        20,
      ),
    ).toBe(true);
    expect(
      looksLikeFeedback(
        "The calendar page is broken on Safari",
        DEFAULT_KEYWORDS,
        20,
      ),
    ).toBe(true);
  });

  it("drops chit-chat and short messages", () => {
    expect(
      looksLikeFeedback("What's the weather today?", DEFAULT_KEYWORDS, 20),
    ).toBe(false);
    expect(looksLikeFeedback("bug", DEFAULT_KEYWORDS, 20)).toBe(false);
  });
});

describe("parseKeywords", () => {
  it("splits on commas and newlines, lowercased", () => {
    expect(parseKeywords("Wish List, roadmap\nidea")).toEqual([
      "wish list",
      "roadmap",
      "idea",
    ]);
  });
  it("falls back to the defaults when empty", () => {
    expect(parseKeywords("  ")).toBe(DEFAULT_KEYWORDS);
    expect(parseKeywords(null)).toBe(DEFAULT_KEYWORDS);
  });
});
