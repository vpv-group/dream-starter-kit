import { spawnSync } from "node:child_process";

/**
 * Local "apply" after `pnpm mod add|update|remove`: bring the running local
 * stack and the generated types in line with the change, so a module is
 * ready to preview with one command (docs/MODULES.md → Lifecycle).
 *
 *   1. `supabase migration up --local` — applies only the NEW migrations the
 *      op materialized (keeps your data; no full reset);
 *   2. `pnpm db:gen-types` — Supabase types include the module's tables;
 *   3. `pnpm cms:gen-types` — Payload types include its collections.
 *
 * The Payload `cms` schema needs no step: in dev, Payload's push creates the
 * module's collections the next time the dev server boots.
 *
 * Skipped in CI / GitHub Actions (module-ops.yml regenerates types on its own
 * runner), with `--no-apply`, after a conflicted update (resolve, then
 * `--continue`), and when the local Supabase isn't running (it says how to
 * catch up instead).
 */

export interface ApplyInput {
  env: Record<string, string | undefined>;
  noApply: boolean;
  /** The op ended with conflicts or another failure (process.exitCode set). */
  failed: boolean;
  supabaseRunning: boolean;
}

export type ApplyPlan =
  | { run: false; reason: "ci" | "opted-out" | "failed" | "no-stack" }
  | { run: true; commands: [string, ...string[]][] };

export const APPLY_COMMANDS: [string, ...string[]][] = [
  ["supabase", "migration", "up", "--local"],
  ["pnpm", "db:gen-types"],
  ["pnpm", "cms:gen-types"],
];

export function planApply(input: ApplyInput): ApplyPlan {
  if (input.env.CI || input.env.GITHUB_ACTIONS)
    return { run: false, reason: "ci" };
  if (input.noApply) return { run: false, reason: "opted-out" };
  if (input.failed) return { run: false, reason: "failed" };
  if (!input.supabaseRunning) return { run: false, reason: "no-stack" };
  return { run: true, commands: APPLY_COMMANDS };
}

const CATCH_UP =
  "supabase migration up --local && pnpm db:gen-types && pnpm cms:gen-types";

export function applyLocal(repoRoot: string, opts: { noApply: boolean }): void {
  const plan = planApply({
    env: process.env,
    noApply: opts.noApply,
    failed: Boolean(process.exitCode),
    supabaseRunning:
      spawnSync("supabase", ["status"], { cwd: repoRoot, stdio: "ignore" })
        .status === 0,
  });
  if (!plan.run) {
    if (plan.reason === "no-stack") {
      console.log(
        `\nmod: the local Supabase isn't running, so the database and types weren't updated.\n` +
          `     Start it (pnpm dev:setup), then run: ${CATCH_UP}\n`,
      );
    }
    return;
  }
  console.log("\nmod: applying to the local stack (--no-apply skips)");
  for (const [cmd, ...args] of plan.commands) {
    console.log(`mod: $ ${cmd} ${args.join(" ")}`);
    const res = spawnSync(cmd, args, { cwd: repoRoot, stdio: "inherit" });
    if (res.status !== 0) {
      console.error(
        `mod: "${cmd} ${args.join(" ")}" failed. Fix it, then run: ${CATCH_UP}`,
      );
      process.exitCode = 1;
      return;
    }
  }
  console.log("mod: done. Restart the dev server if it's running.");
}
