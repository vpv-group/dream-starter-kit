import { expect, test } from "@playwright/test";

/**
 * Native app menu config (GET /api/nav/native) — the public endpoint the
 * Expo app loads its tab bar from (docs/CMS.md → `nav-items`). Structural
 * checks only, so staff edits to the seeded menu don't break it.
 */
test.describe("native navigation config", () => {
  test("serves a public, cacheable menu config", async ({ request }) => {
    const res = await request.get("/api/nav/native");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("s-maxage=60");

    const body = (await res.json()) as {
      version: string;
      tabCount: number;
      items: {
        key: string;
        href: string;
        sf: string;
        md: string;
        hidden: boolean;
      }[];
    };
    expect(body.version).toMatch(/^[0-9a-f]{8}$/);
    expect([3, 4]).toContain(body.tabCount);
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.sf).not.toBe("");
      expect(item.md).not.toBe("");
      expect(typeof item.hidden).toBe("boolean");
    }
    // Core entries + the dashboard's native home are always installed.
    const hrefs = body.items.map((i) => i.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/home", "/profile"]));
    // Web-only rows (the /a sidebar's Dashboard) never reach native.
    expect(hrefs).not.toContain("/a");
  });
});
