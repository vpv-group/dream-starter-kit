import { describe, expect, it } from "vitest";

import { allDone, serviceChecks } from "./services-core";

const ready = {
  siteUrl: "https://app.acme.com",
  scheduler: { configured: true, reachable: true },
  storageConfigured: true,
  authConfigured: true,
  canFixAuth: true,
};

describe("serviceChecks", () => {
  it("is all done on a fully set up deployment", () => {
    expect(allDone(serviceChecks(ready))).toBe(true);
  });

  it("flags what's missing, with a Fix only where Meet Dream can do it", () => {
    const checks = serviceChecks({
      ...ready,
      siteUrl: "http://localhost:3000",
      scheduler: { configured: false, reachable: null },
      storageConfigured: false,
      authConfigured: false,
    });
    expect(checks.map((c) => [c.key, c.status, Boolean(c.fix)])).toEqual([
      ["site-url", "needs-you", false],
      ["auth", "needs-you", true],
      ["storage", "needs-you", false],
      ["cron", "needs-you", false],
    ]);
    expect(
      serviceChecks({ ...ready, authConfigured: false, canFixAuth: false })[1]
        ?.fix,
    ).toBeUndefined();
  });

  it("judges scheduled jobs by Supabase Cron, not a CRON_SECRET", () => {
    const cron = (
      scheduler: Parameters<typeof serviceChecks>[0]["scheduler"],
    ) => serviceChecks({ ...ready, scheduler }).find((c) => c.key === "cron");
    // Set up, no call yet: fine (the first tick is under a minute away).
    expect(cron({ configured: true, reachable: null })?.status).toBe("done");
    // The latest call failed: say why.
    const failing = cron({
      configured: true,
      reachable: false,
      lastFailure: "HTTP 401",
    });
    expect(failing?.status).toBe("needs-you");
    expect(failing?.hint).toContain("HTTP 401");
    // Not booted against this database yet.
    expect(cron({ configured: false, reachable: null })?.hint).toContain(
      "Vault",
    );
  });
});
