import { describe, expect, it } from "vitest";

import { allDone, serviceChecks } from "./services-core";

const ready = {
  siteUrl: "https://app.acme.com",
  env: { CRON_SECRET: "c" },
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
      env: {},
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
});
