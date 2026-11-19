import { execSync } from "node:child_process";

/**
 * `pnpm install` after the module tooling changed workspace dependencies
 * itself (adding, linking or removing a module package). The lockfile must
 * be allowed to change: on CI runners (`CI=true`) pnpm otherwise defaults
 * to --frozen-lockfile and refuses the change it was asked to make.
 */
export function installWorkspace(repoRoot: string): void {
  execSync("pnpm install --no-frozen-lockfile", {
    cwd: repoRoot,
    stdio: "inherit",
  });
}
