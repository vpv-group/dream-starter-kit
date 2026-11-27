import { Script } from "node:vm";
import { describe, expect, it } from "vitest";

import { buildEmbedScript } from "../src/server/embed-script";
import { parseEmbedOrigins } from "../src/shared/embed";

describe("parseEmbedOrigins", () => {
  it("normalizes sites and reports the rest", () => {
    expect(
      parseEmbedOrigins(
        "https://www.Example.com/docs/\nhttp://localhost:4321, ftp://nope\n\nhttp://insecure.example.com",
      ),
    ).toEqual({
      origins: ["https://www.example.com", "http://localhost:4321"],
      invalid: ["ftp://nope", "http://insecure.example.com"],
    });
  });
  it("is empty for nothing", () => {
    expect(parseEmbedOrigins(null)).toEqual({ origins: [], invalid: [] });
  });
});

describe("buildEmbedScript", () => {
  it("is valid JavaScript with the origin JSON-escaped", () => {
    const js = buildEmbedScript('https://app.example.com/"evil', true);
    // Compile only (never run): a syntax error throws here.
    expect(() => new Script(js)).not.toThrow();
    expect(js).toContain('var BASE = "https://app.example.com/\\"evil";');
  });
  it("only trusts messages from the app's origin", () => {
    const js = buildEmbedScript("https://app.example.com/", true);
    expect(js).toContain('var BASE = "https://app.example.com";');
    expect(js).toContain("if (e.origin !== BASE");
  });
  it("only warns when the widget is off", () => {
    const js = buildEmbedScript("https://app.example.com", false);
    expect(js).toContain("console.warn");
    expect(js).not.toContain("DreamFeedback =");
  });
});
