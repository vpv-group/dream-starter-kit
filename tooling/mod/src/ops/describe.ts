import type { ModLockEntry } from "../lock";
import type { PrMeta } from "./pr-meta";
import { prMarker } from "./pr-meta";

/**
 * `pnpm mod ops describe` — the PR marker for a module op, from the lock
 * before and after it ran (module-ops.yml copies modules.lock first).
 * `verified` is true only for registry installs, whose zip sha256 the CLI
 * checked against the registry before installing (registry.ts).
 */
export function describeModuleOp(
  op: "add" | "update" | "remove",
  before: Record<string, ModLockEntry>,
  after: Record<string, ModLockEntry>,
  slugHint?: string,
): PrMeta | null {
  // An empty hint (add: the workflow doesn't know the slug yet) means
  // "the module that appeared".
  let slug = slugHint;
  if (!slug && op === "add") {
    slug = Object.keys(after).find((s) => !(s in before));
  }
  if (!slug) return null;
  const prev = before[slug];
  const next = after[slug];
  const source = (op === "remove" ? prev : next)?.source;
  return {
    kind: "module",
    op,
    slug,
    ...(prev?.version ? { from: prev.version } : {}),
    ...(op !== "remove" && next?.version ? { to: next.version } : {}),
    verified: typeof source === "object" && source.type === "registry",
  };
}

export function describeOutput(meta: PrMeta | null): string {
  if (!meta) return "marker=\nslug=\n";
  return (
    `marker=${prMarker(meta)}\n` +
    `slug=${meta.slug}\n` +
    `from=${meta.from ?? ""}\n` +
    `to=${meta.to ?? ""}\n`
  );
}
