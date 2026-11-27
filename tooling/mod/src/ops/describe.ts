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
  /** add: what was asked for (`dream:<slug>` sources or slugs), in order. */
  requested: string[] = [],
): PrMeta | null {
  const added =
    op === "add" ? Object.keys(after).filter((s) => !(s in before)) : [];
  // An empty hint (add: the workflow doesn't know the slug yet) means the
  // first requested module that appeared, else the first that appeared.
  const requestedSlugs = requested.map((r) =>
    r.replace(/^dream:/, "").replace(/@.*$/, ""),
  );
  let slug = slugHint;
  if (!slug && op === "add") {
    slug =
      requestedSlugs.find((s) => added.includes(s)) ?? [...added].sort()[0];
  }
  if (!slug) return null;
  const prev = before[slug];
  const next = after[slug];
  const source = (op === "remove" ? prev : next)?.source;
  const also = added.filter((s) => s !== slug).sort();
  return {
    kind: "module",
    op,
    slug,
    ...(prev?.version ? { from: prev.version } : {}),
    ...(op !== "remove" && next?.version ? { to: next.version } : {}),
    verified: typeof source === "object" && source.type === "registry",
    ...(also.length > 0 ? { also } : {}),
  };
}

export function describeOutput(meta: PrMeta | null): string {
  if (!meta) return "marker=\nslug=\n";
  return (
    `marker=${prMarker(meta)}\n` +
    `slug=${meta.slug}\n` +
    `from=${meta.from ?? ""}\n` +
    `to=${meta.to ?? ""}\n` +
    `also=${(meta.also ?? []).join(" ")}\n`
  );
}
