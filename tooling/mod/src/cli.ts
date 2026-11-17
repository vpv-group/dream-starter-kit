import { create } from "./create";
import {
  add,
  eject,
  payloadMigrate,
  remove,
  status,
  update,
} from "./lifecycle";
import { ModValidationError } from "./manifests";
import { findRepoRoot } from "./paths";
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
  add <url[#vX.Y.Z]|.zip>    Vendor a module from GitHub or a zip.
  update <slug> [--to vX.Y.Z] [--continue]
                             Three-way merge a new upstream version over your
                             (possibly modified) vendored copy.
  remove <slug> [--keep-data]
                             Uninstall: drop migration(s), delete the package,
                             tombstone the lock, regenerate.
  list | status [--json] [--check]
                             Installed modules, local modifications, and
                             (--check) upstream update availability.
  eject <slug> --repo <url>  Publish a local module to its own GitHub repo.
  payload-migrate <slug> <desc>
                             Create a cms migration and relocate it into the
                             module (§3.2 wrapper).
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
      if (!args[0]) throw new Error("usage: pnpm mod add <url|zip>");
      await add(root, args[0]);
      return;
    case "update":
      if (!args[0]) throw new Error("usage: pnpm mod update <slug>");
      await update(root, args[0], {
        to: flagValue("--to"),
        cont: flags.has("--continue"),
      });
      return;
    case "remove":
      if (!args[0]) throw new Error("usage: pnpm mod remove <slug>");
      await remove(root, args[0], { keepData: flags.has("--keep-data") });
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
        throw new Error("usage: pnpm mod eject <slug> --repo <url>");
      await eject(root, args[0], repo);
      return;
    }
    case "payload-migrate":
      if (!args[0] || !args[1])
        throw new Error("usage: pnpm mod payload-migrate <slug> <desc>");
      await payloadMigrate(root, args[0], args[1]);
      return;
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
  process.exitCode = 1;
});
