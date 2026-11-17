/**
 * @acme/mod-tools — the module framework's sync engine + lifecycle CLI.
 * The exports below are consumed by the registry drift test
 * (apps/nextjs/src/mod/registry-drift.test.ts), which recomputes the expected
 * generated files from the manifests and compares them to the committed ones.
 */
export {
  applyEnvExampleBlock,
  buildAllGeneratedFiles,
  buildEnvExampleBlock,
  type GeneratedFile,
} from "./generate";
export { loadModules, type LoadedModule } from "./manifests";
export { buildLockModule } from "./generate";
export { readLock, readPins } from "./lock";
export type { ModulesLock, ModLockEntry } from "./lock";
export { MOD_PATHS, findRepoRoot, toAbs } from "./paths";
