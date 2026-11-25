import { describe, expect, it } from "vitest";

import {
  deriveCronSecret,
  isCronAuthorized,
  resolveCronSecret,
} from "./cron-secret";

describe("resolveCronSecret", () => {
  it("prefers an explicit CRON_SECRET", () => {
    expect(
      resolveCronSecret({
        CRON_SECRET: "explicit",
        SUPABASE_SERVICE_ROLE_KEY: "srk",
      }),
    ).toBe("explicit");
  });

  it("derives a stable secret from the service-role key", () => {
    const a = resolveCronSecret({ SUPABASE_SERVICE_ROLE_KEY: "srk" });
    expect(a).toBe(deriveCronSecret("srk"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(deriveCronSecret("other"));
  });

  it("is undefined with nothing to derive from", () => {
    expect(resolveCronSecret({})).toBeUndefined();
  });
});

describe("isCronAuthorized", () => {
  const env = { CRON_SECRET: "s3cret" };

  it("accepts the exact bearer header", () => {
    expect(isCronAuthorized("Bearer s3cret", env)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isCronAuthorized("Bearer wrong", env)).toBe(false);
    expect(isCronAuthorized("s3cret", env)).toBe(false);
    expect(isCronAuthorized(null, env)).toBe(false);
    expect(isCronAuthorized("Bearer s3cret", {})).toBe(false);
  });
});
