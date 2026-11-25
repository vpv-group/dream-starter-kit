import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { MOD_PATHS, toAbs } from "./paths";

/**
 * Lock I/O. Two committed, CLI-owned files (docs/MODULES-PLAN.md §3.1, §4):
 *
 * - `modules.lock` (repo root) — the install registry: per-slug version,
 *   origin/provenance, generated-stub paths, copied edge functions,
 *   tombstones. Phase 8 adds baseCommit/pristine-ref provenance.
 * - `modules/.mod-lock.json` — Supabase migration version pins: local
 *   sequence file → assigned 14-digit version + content hash. Append-only;
 *   pinned versions are never reused (tombstoned on removal).
 */

export type ModSource =
  | "local"
  | { type: "github"; repo: string; ref: string; commit: string }
  | { type: "zip"; sha256: string; filename: string }
  /** Paid module installed from a Dream module registry (docs/MODULES.md →
   * Paid modules): `registry` is the base URL, `sha256` the verified hash of
   * the installed release zip. Added in-place — existing locks stay valid. */
  | {
      type: "registry";
      registry: string;
      slug: string;
      version: string;
      sha256: string;
      /** GitHub repo to fall back to when the registry can't serve an
       * update (registry-first — docs/MODULES.md). Optional, added in place. */
      repo?: string;
    };

export interface ModLockEntry {
  version: string;
  kitCompat: string;
  source: ModSource;
  /** Excluded from auto-update when true (admin "Pin" toggle / CLI). */
  pinned?: boolean;
  /** Pristine-base merge anchor (Phase 8 — refs/mod-base/<slug>). */
  baseCommit?: string;
  installedVia?: "cli" | "workflow" | "preinstalled";
  /** Repo-relative paths of generated route stubs — sync owns + deletes these. */
  stubs: string[];
  /** Edge function dirs copied into supabase/functions/. */
  edgeFunctions: string[];
}

export interface ModulesLock {
  lockVersion: 1;
  modules: Record<string, ModLockEntry>;
  /** Removed modules — version pins are never reused. */
  tombstones: Record<string, { removedAtVersion: string }>;
}

export interface MigrationPin {
  /** Assigned 14-digit version — deterministic forever after. */
  version: string;
  /** sha256 of the source SQL — sync hard-errors if it changes after pinning. */
  sha256: string;
  /** Filename materialized into supabase/migrations/. */
  target: string;
}

export interface MigrationPins {
  pins: Record<string, MigrationPin>;
}

const sortKeys = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  ) as T;

export function readLock(repoRoot: string): ModulesLock {
  const file = toAbs(repoRoot, MOD_PATHS.rootLock);
  if (!existsSync(file)) {
    return { lockVersion: 1, modules: {}, tombstones: {} };
  }
  const { extensions, ...lock } = JSON.parse(
    readFileSync(file, "utf8"),
  ) as Partial<ModulesLock> & {
    /** Key used before modules (once "extensions") were renamed. */
    extensions?: ModulesLock["modules"];
  };
  return {
    lockVersion: 1,
    tombstones: {},
    ...lock,
    modules: lock.modules ?? extensions ?? {},
  };
}

export function writeLock(repoRoot: string, lock: ModulesLock): void {
  const file = toAbs(repoRoot, MOD_PATHS.rootLock);
  const stable: ModulesLock = {
    lockVersion: 1,
    modules: sortKeys(lock.modules),
    tombstones: sortKeys(lock.tombstones),
  };
  writeFileSync(file, `${JSON.stringify(stable, null, 2)}\n`);
}

export function readPins(repoRoot: string): MigrationPins {
  const file = toAbs(repoRoot, MOD_PATHS.migrationPins);
  if (!existsSync(file)) return { pins: {} };
  return JSON.parse(readFileSync(file, "utf8")) as MigrationPins;
}

export function writePins(repoRoot: string, pins: MigrationPins): void {
  const file = toAbs(repoRoot, MOD_PATHS.migrationPins);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ pins: sortKeys(pins.pins) }, null, 2)}\n`,
  );
}
