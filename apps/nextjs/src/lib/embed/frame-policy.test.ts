import { describe, expect, it, vi } from "vitest";

import { cachedOrigins, embedSlug, frameAncestors } from "./frame-policy";

describe("embedSlug", () => {
  it("finds the module of an embed path", () => {
    expect(embedSlug("/embed/feedback")).toBe("feedback");
    expect(embedSlug("/embed/feedback/p/abc")).toBe("feedback");
    expect(embedSlug("/embedded")).toBeNull();
    expect(embedSlug("/embed/Bad_Slug")).toBeNull();
    expect(embedSlug("/feedback")).toBeNull();
  });
});

describe("frameAncestors", () => {
  it("allows only the app when no origins are set", () => {
    expect(frameAncestors([])).toBe("frame-ancestors 'self'");
  });
  it("lists valid origins and drops anything else", () => {
    expect(
      frameAncestors([
        "https://www.example.com",
        "http://localhost:4321",
        "https://evil.com; script-src *",
        "http://insecure.example.com",
      ]),
    ).toBe(
      "frame-ancestors 'self' https://www.example.com http://localhost:4321",
    );
  });
});

describe("cachedOrigins", () => {
  it("caches per slug for a minute and fails closed", async () => {
    let t = 0;
    const fetcher = vi
      .fn<(slug: string) => Promise<string[]>>()
      .mockResolvedValueOnce(["https://a.example"])
      .mockRejectedValueOnce(new Error("down"));
    const get = cachedOrigins(fetcher, () => t);
    await expect(get("feedback")).resolves.toEqual(["https://a.example"]);
    t = 30_000;
    await expect(get("feedback")).resolves.toEqual(["https://a.example"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    t = 61_000;
    await expect(get("feedback")).resolves.toEqual([]);
  });
});
