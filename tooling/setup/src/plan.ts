import type { Profile } from "./env-writer";

/**
 * Which bootstrap steps each profile runs (pure — plan.test.ts pins it).
 *
 *   local  a developer's machine: Docker is theirs to run; data is kept
 *          between runs (reset only on first setup or --reset); a dev admin
 *          is created so /admin works without signing up.
 *   cloud  Claude Code on the web (the SessionStart hook): starts dockerd,
 *          installs the pinned Supabase CLI, boots Supabase WITHOUT
 *          edge-runtime (the sandbox forbids its rlimits), always resets
 *          (as the hook always did), installs Playwright's Chromium.
 *   ci     the `integration` job: a FRESH stack shaped like a new hosted
 *          project — TLS on Postgres, the seeded CMS role/schema dropped,
 *          a minimal .env, no dev user (the e2e founder flow needs zero users).
 */
export type Step =
  | "dockerd"
  | "supabase-cli"
  | "supabase-start"
  | "db-tls"
  | "env"
  | "drop-cms-role"
  | "db-reset"
  | "dev-admin"
  | "browsers";

export interface Options {
  profile: Profile;
  /** Force `pnpm db:reset` (local only; cloud always resets, ci never). */
  reset: boolean;
  /** Skip creating the dev admin (local/cloud). */
  devAdmin: boolean;
  /** Install Playwright's Chromium (local opt-in; cloud always). */
  browsers: boolean;
}

export interface Context {
  /** The root `.env` didn't exist before this run. */
  envIsNew: boolean;
}

export function planSteps(options: Options, context: Context): Step[] {
  const { profile } = options;
  const steps: Step[] = [];
  if (profile === "cloud") steps.push("dockerd");
  if (profile !== "ci") steps.push("supabase-cli");
  steps.push("supabase-start");
  if (profile === "ci") steps.push("db-tls");
  steps.push("env");
  if (profile === "ci") {
    steps.push("drop-cms-role");
    return steps;
  }
  if (profile === "cloud" || options.reset || context.envIsNew) {
    steps.push("db-reset");
  }
  if (options.devAdmin) steps.push("dev-admin");
  if (profile === "cloud" || options.browsers) steps.push("browsers");
  return steps;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    profile: "local",
    reset: false,
    devAdmin: true,
    browsers: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--profile") {
      const value = argv[++i];
      if (value !== "local" && value !== "cloud" && value !== "ci") {
        throw new Error(`--profile must be local, cloud or ci (got ${value})`);
      }
      options.profile = value;
    } else if (arg?.startsWith("--profile=")) {
      return parseArgs([
        ...argv.slice(0, i),
        "--profile",
        arg.slice("--profile=".length),
        ...argv.slice(i + 1),
      ]);
    } else if (arg === "--reset") options.reset = true;
    else if (arg === "--no-dev-admin") options.devAdmin = false;
    else if (arg === "--browsers") options.browsers = true;
    else throw new Error(`Unknown option ${arg}`);
  }
  if (options.profile === "ci") options.devAdmin = false;
  return options;
}
