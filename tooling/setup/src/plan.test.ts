import { describe, expect, it } from "vitest";

import { parseArgs, planSteps } from "./plan";

const fresh = { envIsNew: true };
const existing = { envIsNew: false };

describe("planSteps", () => {
  it("local: keeps data on re-runs, resets on first setup", () => {
    expect(planSteps(parseArgs([]), existing)).toEqual([
      "supabase-cli",
      "supabase-start",
      "env",
      "dev-admin",
    ]);
    expect(planSteps(parseArgs([]), fresh)).toEqual([
      "supabase-cli",
      "supabase-start",
      "env",
      "db-reset",
      "dev-admin",
    ]);
    expect(planSteps(parseArgs(["--reset", "--browsers"]), existing)).toEqual([
      "supabase-cli",
      "supabase-start",
      "env",
      "db-reset",
      "dev-admin",
      "browsers",
    ]);
  });

  it("cloud: matches the old SessionStart hook, plus the dev admin", () => {
    expect(planSteps(parseArgs(["--profile", "cloud"]), existing)).toEqual([
      "dockerd",
      "supabase-cli",
      "supabase-start",
      "env",
      "db-reset",
      "dev-admin",
      "browsers",
    ]);
  });

  it("ci: a fresh hosted-like stack with no dev user and no reset", () => {
    expect(planSteps(parseArgs(["--profile=ci"]), fresh)).toEqual([
      "supabase-start",
      "db-tls",
      "env",
      "drop-cms-role",
    ]);
  });

  it("--no-dev-admin skips the dev user", () => {
    expect(planSteps(parseArgs(["--no-dev-admin"]), existing)).not.toContain(
      "dev-admin",
    );
  });
});

describe("parseArgs", () => {
  it("rejects unknown profiles and flags", () => {
    expect(() => parseArgs(["--profile", "prod"])).toThrow(
      /local, cloud or ci/,
    );
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown option/);
  });

  it("ignores the -- pnpm passes through", () => {
    expect(parseArgs(["--", "--profile", "cloud"]).profile).toBe("cloud");
  });
});
