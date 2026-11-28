import { appendFileSync, readFileSync } from "node:fs";

import type { ModulesLock } from "./lock";
import { applyLocal } from "./apply";
import { create } from "./create";
import {
  add,
  eject,
  payloadMigrate,
  remove,
  status,
  update,
} from "./lifecycle";
import { readLock } from "./lock";
import { ModValidationError } from "./manifests";
import { applyBaseline, baselineOutput, planBaseline } from "./ops/baseline";
import { describeModuleOp, describeOutput } from "./ops/describe";
import { githubClient } from "./ops/github";
import { planKitUpdate, toGithubOutput } from "./ops/kit-update";
import { runMerge, watchDeployment } from "./ops/merge";
import { reporter } from "./ops/report";
import { resolveGeneratedConflicts } from "./ops/resolve-generated";
import { verifyRouteStubs } from "./ops/route-stubs";
import { openSession, sessionOutputs } from "./ops/session";
import { findRepoRoot } from "./paths";
import { registryUrl } from "./registry";
import { sync } from "./sync";

/**
 * Module lifecycle CLI (docs/MODULES-PLAN.md §5). One implementation,
 * two front doors: developers run `pnpm mod <cmd>`, the admin panel's GitHub
 * Actions workflow (module-ops.yml) runs the same commands with --json.
 */
const HELP = `Usage: pnpm mod <command>

Commands:
  sync                       Regenerate registries, stubs, migrations and env
                             from modules/* (run after any change there).
  create <slug>              Scaffold a new local module.
  add <source>…              Vendor modules (each url[#vX.Y.Z] | .zip |
                             dream:<slug>[@x.y.z] | <slug>) from GitHub, a
                             zip, or the Dream registry (paid modules: set
                             DREAM_TOKEN; in module-ops.yml the run signs
                             in by itself).
                             Registry-first: modules the registry lists come
                             from it, with GitHub as fallback. Modules they
                             require that aren't installed come along.
  update <slug> [--to vX.Y.Z] [--from <url|dream:<slug>>] [--continue]
                             Three-way merge a new upstream version over your
                             (possibly modified) vendored copy. --from switches
                             the module's origin (e.g. GitHub → registry).
  remove <slug> [--keep-data]
                             Uninstall: drop migration(s), delete the package,
                             tombstone the lock, regenerate.

  add, update and remove then apply the change to the local stack
  (supabase migration up, pnpm db:gen-types, pnpm cms:gen-types) unless
  --no-apply is passed or this runs in CI.
  list | status [--json] [--check]
                             Installed modules, local modifications, and
                             (--check) upstream update availability.
  eject <slug> --repo <url> [--resume <dir>]
                             Publish a local module to its own GitHub repo.
                             --resume pushes the repo a failed eject kept.
  payload-migrate <slug> <desc>
                             Create a cms migration and relocate it into the
                             module (§3.2 wrapper).
  ops kit-plan [--upstream <url>] [--github-output]
                             Which Dream Starter Kit release to offer (the
                             newest vX.Y.Z tag, never main); fetches it into
                             refs/remotes/upstream/release. Used by
                             module-ops.yml (--github-output prints key=value
                             lines for $GITHUB_OUTPUT instead of JSON).
  ops session --output-file <path>
                             module-ops.yml's sign-in: trades the job's OIDC
                             token for a one-hour repo token + the owner's
                             update settings (appended to <path>).
  ops describe --op <add|update|remove> --before <lock.json> [--slug <slug>]
                [--requested "<source…>"]
                             The PR marker for a module op (key=value lines).
  ops baseline [--upstream <url>] [--apply]
                             A repo with no history shared with the kit: record
                             the kit release matching package.json as an
                             ancestor (merge -s ours, no file changes).
  ops resolve-generated      During a conflicted kit merge: take the release's
                             side of generated files (regenerated afterwards);
                             prints remaining=<files> for a person.
  ops merge [--approve <pr>] Merge the update PRs that are ready (decideMerge),
                             one per run; label the rest for review; watch
                             the production deploy and report to Meet Dream.
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const args = rest.filter((a) => !a.startsWith("--"));
  const flagValue = (name: string): string | undefined => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const root = findRepoRoot();

  switch (command) {
    case "sync":
      await sync(root);
      return;
    case "create":
      if (!args[0]) throw new Error("usage: pnpm mod create <slug>");
      await create(root, args[0]);
      return;
    case "add":
      if (!args[0]) throw new Error("usage: pnpm mod add <url|zip|slug>…");
      await add(root, args);
      applyLocal(root, { noApply: flags.has("--no-apply") });
      return;
    case "update":
      if (!args[0]) throw new Error("usage: pnpm mod update <slug>");
      await update(root, args[0], {
        to: flagValue("--to"),
        from: flagValue("--from"),
        cont: flags.has("--continue"),
      });
      applyLocal(root, { noApply: flags.has("--no-apply") });
      return;
    case "remove":
      if (!args[0]) throw new Error("usage: pnpm mod remove <slug>");
      await remove(root, args[0], { keepData: flags.has("--keep-data") });
      applyLocal(root, { noApply: flags.has("--no-apply") });
      return;
    case "list":
      await status(root, { json: flags.has("--json"), checkUpstream: false });
      return;
    case "status":
      await status(root, {
        json: flags.has("--json"),
        checkUpstream: flags.has("--check") || flags.has("--json"),
      });
      return;
    case "eject": {
      const repo = flagValue("--repo");
      if (!args[0] || !repo)
        throw new Error(
          "usage: pnpm mod eject <slug> --repo <url> [--resume <dir>]",
        );
      await eject(root, args[0], repo, { resume: flagValue("--resume") });
      return;
    }
    case "payload-migrate":
      if (!args[0] || !args[1])
        throw new Error("usage: pnpm mod payload-migrate <slug> <desc>");
      await payloadMigrate(root, args[0], args[1]);
      return;
    case "ops": {
      if (args[0] === "session") {
        const out = flagValue("--output-file");
        if (!out)
          throw new Error("usage: pnpm mod ops session --output-file <path>");
        const result = await openSession(registryUrl());
        const { log, output } = sessionOutputs(result);
        process.stdout.write(log);
        appendFileSync(out, output);
        return;
      }
      if (args[0] === "baseline") {
        const plan = planBaseline({
          repoRoot: root,
          upstreamUrl:
            flagValue("--upstream") ??
            "https://github.com/vpv-group/dream-starter-kit.git",
        });
        if (plan.action === "merge" && flags.has("--apply")) {
          applyBaseline(root, plan);
        }
        process.stdout.write(baselineOutput(plan));
        return;
      }
      if (args[0] === "resolve-generated") {
        const { resolved, remaining } = resolveGeneratedConflicts(root);
        process.stdout.write(
          `resolved=${resolved.join(" ")}\nremaining=${remaining.join(" ")}\n`,
        );
        return;
      }
      if (args[0] === "verify-route-stubs") {
        // stdin: changed paths, one per line → stdout: the ones that aren't
        // route pages exactly as `mod sync` generates them.
        const changed = readFileSync(0, "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const bad = await verifyRouteStubs(root, changed);
        process.stdout.write(bad.length ? `${bad.join("\n")}\n` : "");
        return;
      }
      if (args[0] === "describe") {
        const op = flagValue("--op");
        const beforeFile = flagValue("--before");
        if (
          (op !== "add" && op !== "update" && op !== "remove") ||
          !beforeFile
        ) {
          throw new Error(
            "usage: pnpm mod ops describe --op <add|update|remove> --before <lock.json>",
          );
        }
        const before = JSON.parse(
          readFileSync(beforeFile, "utf8"),
        ) as Partial<ModulesLock>;
        const meta = describeModuleOp(
          op,
          before.modules ?? {},
          readLock(root).modules,
          flagValue("--slug"),
          (flagValue("--requested") ?? "").split(/\s+/).filter(Boolean),
        );
        process.stdout.write(describeOutput(meta));
        return;
      }
      if (args[0] === "merge") {
        const registry = registryUrl();
        const result = await openSession(registry);
        if (result.status !== "ok") {
          process.stdout.write(sessionOutputs(result).log);
          return;
        }
        const { session } = result;
        process.stdout.write(`::add-mask::${session.githubToken}\n`);
        const gh = githubClient({
          repo: session.repo,
          token: session.githubToken,
        });
        const log = (line: string) => process.stdout.write(`${line}\n`);
        const approve = Number(flagValue("--approve") ?? "");
        const outcomes = await runMerge({
          gh,
          session,
          ...(Number.isInteger(approve) && approve > 0
            ? { approvePr: approve }
            : {}),
          report: reporter(registry, process.env, fetch, log),
          watchDeploy: (sha) =>
            watchDeployment(gh, sha, {
              healthUrl: session.site.url
                ? `${session.site.url.replace(/\/+$/, "")}/api/health/db`
                : null,
            }),
          log,
        });
        process.stdout.write(`${JSON.stringify(outcomes)}\n`);
        return;
      }
      if (args[0] !== "kit-plan") {
        throw new Error(
          "usage: pnpm mod ops kit-plan|session|merge (see pnpm mod help)",
        );
      }
      const plan = planKitUpdate({
        repoRoot: root,
        upstreamUrl:
          flagValue("--upstream") ??
          "https://github.com/vpv-group/dream-starter-kit.git",
      });
      // --github-output: key=value lines to append to $GITHUB_OUTPUT.
      process.stdout.write(
        flags.has("--github-output")
          ? toGithubOutput(plan)
          : `${JSON.stringify(plan)}\n`,
      );
      return;
    }
    case undefined:
    case "help":
    case "--help":
      console.log(HELP);
      return;
    default:
      console.error(`Unknown command "${command}".\n\n${HELP}`);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  if (err instanceof ModValidationError) {
    console.error(`\nmod: validation failed — ${err.message}\n`);
  } else {
    console.error(err instanceof Error ? `mod: ${err.message}` : err);
  }
  // In module-ops.yml: the run's annotation says why, not just "exit code 1"
  // (/admin links to it).
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.GITHUB_ACTIONS === "true") {
    const msg = (err instanceof Error ? err.message : String(err))
      .replace(/%/g, "%25")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A");
    console.log(`::error title=Module operation failed::${msg}`);
  }
  process.exitCode = 1;
});
