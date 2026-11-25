import { z } from "zod/v4";

import type { PrOp } from "./decide-merge";

/**
 * Update PRs carry a hidden, machine-readable marker in their body so the
 * merge step knows what it is looking at without parsing titles:
 *
 *   <!-- dream-update {"kind":"module","op":"update","slug":"crm",…} -->
 *
 * Labels and branch names are for people; this marker is for module-ops.
 * PRs opened before it existed are recognized by branch name (legacyMeta)
 * for one release and never merge themselves (unverified).
 */

export const UPDATE_LABEL = "dream-update";
export const CONFLICTS_LABEL = "dream-update-conflicts";
export const REMOVE_LABEL = "dream-remove";
export const REVIEW_LABEL = "dream-review";
/** Recognized for one release so in-flight PRs still show in /admin. */
export const LEGACY_LABELS = [
  "module-op",
  "module-op-conflicts",
  "kit-update",
  "kit-update-conflicts",
];

const metaSchema = z.object({
  kind: z.enum(["kit", "module"]),
  op: z.enum(["add", "update", "remove", "kit-update"]),
  slug: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  /**
   * The code was verified on this run: a kit release's build attestation,
   * or a registry download's sha256. False for GitHub/zip sources.
   */
  verified: z.boolean(),
  /** When the release was published (kit: the tag's date), if known. */
  publishedAt: z.string().optional(),
});

export type PrMeta = z.infer<typeof metaSchema>;

const MARKER = /<!--\s*dream-update\s+(\{[\s\S]*?\})\s*-->/;

export function prMarker(meta: PrMeta): string {
  return `<!-- dream-update ${JSON.stringify(metaSchema.parse(meta))} -->`;
}

export function parsePrMeta(body: string | null): PrMeta | null {
  const match = body ? MARKER.exec(body) : null;
  if (!match?.[1]) return null;
  try {
    const parsed = metaSchema.safeParse(JSON.parse(match[1]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** PRs opened by the old workflow: `mod/<op>-<slug>-<run>`, `sync/upstream-*`. */
export function legacyMeta(branch: string): PrMeta | null {
  if (branch.startsWith("sync/upstream-")) {
    return { kind: "kit", op: "kit-update", slug: "kit", verified: false };
  }
  const match =
    /^(?:mod|dream)\/(add|update|remove)-([a-z][a-z0-9-]*?)-\d+$/.exec(branch);
  if (!match?.[1] || !match[2] || match[2] === "new") return null;
  return {
    kind: "module",
    op: match[1] as PrOp,
    slug: match[2],
    verified: false,
  };
}

/** Is this an update PR, and what kind? (marker first, then legacy branch) */
export function updatePrMeta(pr: {
  body: string | null;
  headRef: string;
}): PrMeta | null {
  return parsePrMeta(pr.body) ?? legacyMeta(pr.headRef);
}

/** Bot branch for an update PR; `dream/kit-update-*` is refreshed in place. */
export function branchFor(
  meta: Pick<PrMeta, "op" | "slug">,
  suffix: string,
): string {
  return meta.op === "kit-update"
    ? `dream/kit-update-${suffix}`
    : `dream/${meta.op}-${meta.slug}-${suffix}`;
}
