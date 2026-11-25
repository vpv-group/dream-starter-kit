import { describe, expect, it } from "vitest";

import { cmsPoolSizing } from "./pool-sizing";

describe("cmsPoolSizing", () => {
  it("keeps the serverless pool small and fail-fast (Vercel settings)", () => {
    expect(cmsPoolSizing({ cli: false })).toEqual({
      max: 2,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
    });
  });

  it("gives CLI scripts a wider pool and a longer acquire wait", () => {
    const server = cmsPoolSizing({ cli: false });
    const cli = cmsPoolSizing({ cli: true });
    expect(cli.max).toBeGreaterThan(server.max);
    expect(cli.connectionTimeoutMillis).toBeGreaterThan(
      server.connectionTimeoutMillis,
    );
  });
});
