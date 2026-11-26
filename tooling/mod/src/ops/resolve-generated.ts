import { execFileSync } from "node:child_process";

/**
 * Kit update conflicts in GENERATED files are not real conflicts: take the
 * release's side and regenerate after the merge (module-ops.yml runs
 * pnpm install, mod sync, db:gen-migrations and both gen-types). Only
 * hand-written files are left for a person (docs/UPDATING.md → Conflict
 * hotspots).
 */

const GENERATED = [
  /^pnpm-lock\.yaml$/,
  /^packages\/cms\/src\/payload-types\.ts$/,
  /^packages\/api\/src\/types\.ts$/,
  /^apps\/nextjs\/src\/lib\/db\/supabase-migrations\.generated\.json$/,
  /^apps\/nextjs\/mod-packages\.generated\.json$/,
  /(^|\/)[^/]+\.generated\.[a-z]+$/,
];

export function isGeneratedFile(file: string): boolean {
  return GENERATED.some((re) => re.test(file));
}

export function splitConflicts(files: string[]): {
  generated: string[];
  manual: string[];
} {
  const generated: string[] = [];
  const manual: string[] = [];
  for (const f of files) (isGeneratedFile(f) ? generated : manual).push(f);
  return { generated, manual };
}

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
  }).trim();
}

/**
 * During a conflicted merge: resolve generated files to the incoming side
 * ("theirs" = the kit release) and stage them. Returns what's left.
 */
export function resolveGeneratedConflicts(repoRoot: string): {
  resolved: string[];
  remaining: string[];
} {
  const conflicted = git(repoRoot, ["diff", "--name-only", "--diff-filter=U"])
    .split("\n")
    .filter(Boolean);
  const { generated, manual } = splitConflicts(conflicted);
  for (const file of generated) {
    try {
      git(repoRoot, ["checkout", "--theirs", "--", file]);
      git(repoRoot, ["add", "--", file]);
    } catch {
      // Deleted on one side: keep it as a manual conflict.
      manual.push(file);
    }
  }
  return {
    resolved: generated.filter((f) => !manual.includes(f)),
    remaining: manual,
  };
}
