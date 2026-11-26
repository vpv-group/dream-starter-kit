#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Step } from "./plan.js";
import {
  latestRelease,
  parseArgs,
  planCreate,
  renamePackage,
  USAGE,
} from "./plan.js";

/**
 * `npx create-dream-app my-app` (plan.ts has the rules). Node built-ins only,
 * so it runs straight from npm with nothing else installed but git and pnpm.
 */

function run(step: Step, appDir: string): boolean {
  process.stdout.write(`\n→ ${step.label}\n`);
  const res = spawnSync(step.cmd, step.args, {
    cwd: step.cwd === "app" ? appDir : process.cwd(),
    stdio: "inherit",
  });
  return res.status === 0;
}

function capture(cmd: string, args: string[]): string | null {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  return res.status === 0 ? res.stdout : null;
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}`);
    return 1;
  }
  const opts = parsed.options;
  const appDir = path.resolve(opts.dir);
  if (existsSync(appDir)) {
    process.stderr.write(`${opts.dir} already exists. Pick a new directory.\n`);
    return 1;
  }
  for (const tool of ["git", "pnpm"]) {
    if (!capture(tool, ["--version"])) {
      process.stderr.write(`${tool} is required (https://pnpm.io for pnpm).\n`);
      return 1;
    }
  }
  if (opts.github && !capture("gh", ["auth", "status"])) {
    process.stderr.write(
      "--github needs the GitHub CLI, signed in (gh auth login).\n",
    );
    return 1;
  }

  let tag = opts.tag;
  if (!tag) {
    const tags = capture("git", ["ls-remote", "--tags", opts.kitUrl]);
    tag = tags ? (latestRelease(tags) ?? undefined) : undefined;
    if (!tag) {
      process.stderr.write(
        `Couldn't find a Dream Starter Kit release at ${opts.kitUrl}.\n`,
      );
      return 1;
    }
  }

  const steps = planCreate({ ...opts, tag });
  const [clone, ...rest] = steps;
  if (!clone || !run(clone, appDir)) return 1;

  // Name the app before anything is committed or pushed.
  const pkgFile = path.join(appDir, "package.json");
  writeFileSync(
    pkgFile,
    renamePackage(readFileSync(pkgFile, "utf8"), opts.name),
  );
  let renamed = false;
  for (const step of rest) {
    // After `git checkout -b main`: the rename is the app's first commit.
    if (!renamed && step.cmd !== "git") {
      spawnSync("git", ["commit", "-qam", `chore: start ${opts.name}`], {
        cwd: appDir,
        stdio: "inherit",
      });
      renamed = true;
    }
    if (!run(step, appDir)) {
      if (!step.optional) {
        process.stderr.write(
          `\n${step.label} failed. Fix it and rerun that step in ${opts.dir}.\n`,
        );
        return 1;
      }
      process.stdout.write(
        `  (skipped: ${step.label} failed; you can rerun it later)\n`,
      );
    }
  }

  if (!renamed) {
    spawnSync("git", ["commit", "-qam", `chore: start ${opts.name}`], {
      cwd: appDir,
      stdio: "inherit",
    });
  }

  process.stdout.write(
    `\n✓ ${opts.name} is ready in ${opts.dir} (Dream Starter Kit ${tag}).\n\n` +
      `  cd ${opts.dir}\n` +
      `  pnpm dev:next   # web on http://localhost:3000\n` +
      `  pnpm dev        # web + Expo\n\n` +
      (opts.setup
        ? "Sign in with the dev admin printed above (also in .dream/dev-admin.json).\n"
        : "Run pnpm dev:setup when Docker is running.\n") +
      "Kit updates: the kit is the `upstream` remote (docs/UPDATING.md).\n",
  );
  return 0;
}

process.exit(main());
