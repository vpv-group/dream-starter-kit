import { describe, expect, it } from "vitest";

import { APPLY_COMMANDS, planApply } from "./apply";

const base = {
  env: {},
  noApply: false,
  failed: false,
  supabaseRunning: true,
};

describe("planApply", () => {
  it("migrates the local DB and regenerates types after a local op", () => {
    expect(planApply(base)).toEqual({ run: true, commands: APPLY_COMMANDS });
    expect(APPLY_COMMANDS.map((c) => c.join(" "))).toEqual([
      "supabase migration up --local",
      "pnpm db:gen-types",
      "pnpm cms:gen-types",
    ]);
  });

  it("never runs in CI or GitHub Actions (module-ops.yml does its own)", () => {
    expect(planApply({ ...base, env: { CI: "true" } })).toEqual({
      run: false,
      reason: "ci",
    });
    expect(planApply({ ...base, env: { GITHUB_ACTIONS: "true" } })).toEqual({
      run: false,
      reason: "ci",
    });
  });

  it("respects --no-apply, a failed or conflicted op, and a stopped stack", () => {
    expect(planApply({ ...base, noApply: true })).toMatchObject({
      reason: "opted-out",
    });
    expect(planApply({ ...base, failed: true })).toMatchObject({
      reason: "failed",
    });
    expect(planApply({ ...base, supabaseRunning: false })).toMatchObject({
      reason: "no-stack",
    });
  });
});
