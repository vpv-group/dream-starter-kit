/**
 * `pnpm dev:setup [--profile local|cloud|ci] [--reset] [--no-dev-admin] [--browsers]`
 *
 * The ONE environment bootstrap for laptops, Claude Code cloud sessions (the
 * SessionStart hook runs `--profile cloud`) and CI (`--profile ci` in ci.yml's
 * `integration` job). Every step is idempotent. Run `pnpm install` first.
 * (Not `pnpm setup`: that name is pnpm's own built-in command.)
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Step } from "./plan";
import { ensureDevAdmin } from "./dev-admin";
import {
  buildCiEnv,
  buildLocalEnv,
  commentOutEmpty,
  parseSupabaseStatus,
} from "./env-writer";
import { parseArgs, planSteps } from "./plan";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const envFile = path.join(root, ".env");

function log(line: string) {
  console.log(`[dev:setup] ${line}`);
}

/** Run a command in the repo root, streaming output; throw on failure. */
function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...opts.env },
  });
  if (res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed (exit ${res.status ?? "?"})`,
    );
  }
}

/** Run quietly; true when it exits 0. */
function ok(cmd: string, args: string[]): boolean {
  return spawnSync(cmd, args, { cwd: root, stdio: "ignore" }).status === 0;
}

function capture(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd: root, encoding: "utf8" });
}

/** The Supabase CLI version CI pins (ci.yml, supabase/setup-cli `version:`). */
function pinnedSupabaseVersion(): string {
  const ci = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const after = ci.slice(ci.indexOf("supabase/setup-cli"));
  const m = /^\s*version:\s*([0-9.]+)/m.exec(after);
  if (!m?.[1])
    throw new Error(
      "Couldn't read the pinned Supabase CLI version from ci.yml",
    );
  return m[1];
}

function supabaseStatus() {
  return parseSupabaseStatus(capture("supabase", ["status", "-o", "env"]));
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

const handlers: Record<Step, (profile: string) => Promise<void> | void> = {
  async dockerd() {
    if (ok("docker", ["info"])) return;
    log("starting dockerd");
    spawnSync("sh", ["-c", "nohup dockerd >/tmp/dockerd.log 2>&1 &"], {
      stdio: "ignore",
    });
    for (let i = 0; i < 30; i++) {
      if (ok("docker", ["info"])) return;
      await sleep(2000);
    }
    throw new Error("dockerd failed to start; see /tmp/dockerd.log");
  },

  "supabase-cli"(profile) {
    const want = pinnedSupabaseVersion();
    let have: string;
    try {
      have = capture("supabase", ["--version"]).trim();
    } catch {
      have = "";
    }
    if (have === want) return;
    if (profile === "cloud") {
      log(`installing Supabase CLI ${want}`);
      run("npm", ["install", "-g", `supabase@${want}`]);
      return;
    }
    if (!have) {
      throw new Error(
        `The Supabase CLI isn't installed. Install version ${want} (https://supabase.com/docs/guides/local-development/cli/getting-started), then rerun pnpm dev:setup.`,
      );
    }
    log(
      `warning: Supabase CLI ${have} differs from the ${want} CI pins; newer CLIs can reject this repo's config.toml.`,
    );
  },

  "supabase-start"(profile) {
    if (profile !== "local" && profile !== "cloud") {
      run("supabase", ["start"]);
      return;
    }
    if (!ok("docker", ["info"])) {
      throw new Error(
        "Docker isn't running. Start Docker Desktop (or dockerd), then rerun pnpm dev:setup.",
      );
    }
    if (ok("supabase", ["status"])) return;
    log("starting Supabase");
    run(
      "supabase",
      profile === "cloud" ? ["start", "-x", "edge-runtime"] : ["start"],
    );
  },

  "db-tls"() {
    run("bash", ["tooling/scripts/enable-supabase-db-tls.sh"]);
  },

  env(profile) {
    const status = supabaseStatus();
    if (profile === "ci") {
      writeFileSync(envFile, buildCiEnv(status), { mode: 0o600 });
      log("wrote .env (ci profile)");
      return;
    }
    if (existsSync(envFile)) {
      // Repair older files: empty optional vars must be absent, not "".
      writeFileSync(envFile, commentOutEmpty(readFileSync(envFile, "utf8")));
      return;
    }
    const example = readFileSync(path.join(root, ".env.example"), "utf8");
    writeFileSync(
      envFile,
      buildLocalEnv({
        example,
        status,
        payloadSecret: randomBytes(32).toString("base64"),
      }),
      { mode: 0o600 },
    );
    log("wrote .env from .env.example with the local Supabase keys");
  },

  "drop-cms-role"() {
    // Mirror a FRESH hosted project: `supabase start` applied the seeded
    // payload_cms role/cms schema with the LOCAL dev password; hosted projects
    // have neither, and the runtime bootstrap must create both with the
    // credentials derived from SUPABASE_SERVICE_ROLE_KEY.
    const container = capture("docker", [
      "ps",
      "--filter",
      "name=supabase_db_",
      "--format",
      "{{.Names}}",
    ])
      .split("\n")[0]
      ?.trim();
    if (!container) throw new Error("No supabase_db_* container is running.");
    const sql = `drop schema if exists cms cascade;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'payload_cms') then
    drop owned by payload_cms;
    drop role payload_cms;
  end if;
end $$;`;
    const res = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        "-e",
        "PGPASSWORD=postgres",
        container,
        "psql",
        "-h",
        "127.0.0.1",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, stdio: ["pipe", "inherit", "inherit"] },
    );
    if (res.status !== 0)
      throw new Error("Dropping the seeded CMS role failed.");
  },

  "db-reset"() {
    log(
      "resetting the database (Supabase migrations + seed, Payload migrations)",
    );
    run("pnpm", ["db:reset"]);
  },

  async "dev-admin"() {
    const status = supabaseStatus();
    const creds = await ensureDevAdmin({
      apiUrl: status.API_URL ?? "http://127.0.0.1:54321",
      serviceRoleKey: status.SERVICE_ROLE_KEY ?? "",
      root,
      log,
    });
    // No CLI seed here: the kit's own first-visit flow seeds the CMS (the
    // /admin SeedGate → /cms-setup progress bar), the path real founders take.
    log(
      `dev admin ready: ${creds.email} / ${creds.password} (saved in .dream/dev-admin.json). Sign in and open /admin: the first visit seeds the CMS.`,
    );
  },

  browsers() {
    run("pnpm", [
      "-F",
      "@acme/web-e2e",
      "exec",
      "playwright",
      "install",
      "chromium",
    ]);
  },
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const steps = planSteps(options, { envIsNew: !existsSync(envFile) });
  log(`profile ${options.profile}: ${steps.join(" → ")}`);
  for (const [i, step] of steps.entries()) {
    log(`${i + 1}/${steps.length} ${step}`);
    await handlers[step](options.profile);
  }
  log(
    options.profile === "ci"
      ? "done"
      : "done — app: pnpm dev:next (:3000) · Supabase Studio :54323 · Mailpit :54324",
  );
}

main().catch((error: unknown) => {
  console.error(
    `[dev:setup] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
