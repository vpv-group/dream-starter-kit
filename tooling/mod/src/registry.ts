import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import semver from "semver";
import { z } from "zod/v4";

import { DREAM_REGISTRY_DEFAULT_URL, KIT_VERSION } from "@acme/config";

/**
 * Dream module registry client (docs/MODULES.md → Paid modules): paid
 * modules install from `dream:<slug>[@x.y.z]` sources. The registry protocol
 * (meet-dream, docs/MODULES.md there):
 *
 * - `GET  {registry}/catalog?schema=2` — public catalog incl. paid modules
 * - `GET  {registry}/entitlements` — what the license key unlocks
 * - `POST {registry}/download` `{ slug, version?, kitVersion, repo }` →
 *   `{ slug, version, url, sha256, expiresInSeconds }` (a short-lived signed
 *   URL — download immediately, verify the sha256 before installing)
 *
 * The license key travels ONLY in the `X-Dream-License-Key` header and is
 * never printed; in GitHub Actions it is masked with `::add-mask::` before
 * first use so accidental echoes are scrubbed from logs.
 */

/* ------------------------------- sources ------------------------------- */

export const DREAM_SOURCE_PREFIX = "dream:";

const DREAM_SOURCE =
  /^dream:([a-z][a-z0-9-]{1,30})(?:@v?(\d+\.\d+\.\d+(?:-[\w.-]+)?))?$/;

export interface DreamRef {
  slug: string;
  version?: string;
}

export function isDreamSource(arg: string): boolean {
  return arg.startsWith(DREAM_SOURCE_PREFIX);
}

/** Parse `dream:<slug>[@x.y.z]` (slug rules match module slugs). */
export function parseDreamSource(arg: string): DreamRef {
  const match = DREAM_SOURCE.exec(arg);
  if (!match?.[1]) {
    throw new Error(
      `unparseable registry source "${arg}" — expected dream:<slug>[@x.y.z]`,
    );
  }
  return { slug: match[1], ...(match[2] ? { version: match[2] } : {}) };
}

/* ------------------------------- errors -------------------------------- */

/** Spec'd registry error codes → actionable CLI messages. */
export const REGISTRY_ERROR_MESSAGES: Record<string, string> = {
  invalid_key:
    "the registry rejected the license key — check DREAM_LICENSE_KEY",
  revoked_key: "license inactive — updates paused (the license key was revoked)",
  not_entitled:
    "license inactive — updates paused (your plan does not include this module)",
  incompatible_kit: `no release is compatible with kit ${KIT_VERSION} — update the kit first`,
  no_release: "the registry has no release of this module",
  activation_limit:
    "the license key's activation limit is reached — deactivate another repo or upgrade the plan",
  registry_not_configured:
    "the registry endpoint is not configured on the server",
};

/** Codes that mean "the key no longer unlocks this" (a paused, calm state). */
export const LICENSE_INACTIVE_CODES = new Set(["revoked_key", "not_entitled"]);

export class RegistryError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(
      message ??
        REGISTRY_ERROR_MESSAGES[code] ??
        `the registry returned error "${code}"`,
    );
    this.name = "RegistryError";
  }
}

const errorBodySchema = z.object({
  error: z.string().optional(),
  code: z.string().optional(),
});

function toRegistryError(status: number, body: unknown): Error {
  const parsed = errorBodySchema.safeParse(body);
  const code = parsed.success ? (parsed.data.error ?? parsed.data.code) : null;
  if (code) return new RegistryError(code);
  return new Error(`registry request failed (HTTP ${status})`);
}

/* ---------------------------- env / identity ---------------------------- */

export function registryUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return (env.DREAM_REGISTRY_URL ?? DREAM_REGISTRY_DEFAULT_URL).replace(
    /\/+$/,
    "",
  );
}

/**
 * The license key, or null when unset. NEVER printed or logged by the CLI —
 * it travels only in the `X-Dream-License-Key` header. In GitHub Actions the
 * workflow additionally masks it with `::add-mask::` before the CLI runs
 * (module-ops.yml), so even an accidental echo is scrubbed from logs.
 */
export function licenseKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const key = env.DREAM_LICENSE_KEY?.trim();
  return key === undefined || key === "" ? null : key;
}

export function requireLicenseKey(
  env: Record<string, string | undefined> = process.env,
): string {
  const key = licenseKey(env);
  if (!key) {
    throw new Error(
      "DREAM_LICENSE_KEY is not set — paid modules need a license key " +
        "(docs/MODULES.md → Paid modules)",
    );
  }
  return key;
}

/**
 * The installing repo's identity (`owner/repo`) sent with /download so the
 * registry can enforce per-repo activations: GITHUB_REPOSITORY (set by
 * Actions) → GITHUB_REPO → the git origin remote.
 */
export function repoIdentity(
  repoRoot: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const fromEnv = env.GITHUB_REPOSITORY ?? env.GITHUB_REPO;
  if (fromEnv) return fromEnv;
  try {
    const url = execFileSync(
      "git",
      ["-C", repoRoot, "remote", "get-url", "origin"],
      { encoding: "utf8" },
    ).trim();
    const match = /[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/.exec(url);
    if (match?.[1]) return match[1];
  } catch {
    // no origin remote
  }
  throw new Error(
    "could not determine this repo's identity — set GITHUB_REPOSITORY " +
      "(owner/repo) or add a git `origin` remote",
  );
}

/* ------------------------------- download ------------------------------- */

const downloadGrantSchema = z.object({
  slug: z.string().min(1),
  version: z.string().min(1),
  url: z.url(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
  expiresInSeconds: z.number().optional(),
});

export type DownloadGrant = z.infer<typeof downloadGrantSchema>;

export interface DownloadRequest {
  registry: string;
  licenseKey: string;
  slug: string;
  /** Omitted = the latest version compatible with `kitVersion`. */
  version?: string;
  kitVersion: string;
  repo: string;
}

/** `POST {registry}/download` — resolves a release to a short-lived URL. */
export async function requestDownload(
  req: DownloadRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadGrant> {
  const res = await fetchImpl(`${req.registry}/download`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Dream-License-Key": req.licenseKey,
    },
    body: JSON.stringify({
      slug: req.slug,
      ...(req.version ? { version: req.version } : {}),
      kitVersion: req.kitVersion,
      repo: req.repo,
    }),
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw toRegistryError(res.status, body);
  const grant = downloadGrantSchema.safeParse(body);
  if (!grant.success) {
    throw new Error(
      `the registry returned an incomplete download grant for "${req.slug}"`,
    );
  }
  return grant.data;
}

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Download the release zip and verify its sha256 BEFORE writing it to
 * `destFile` — a mismatch aborts the install with nothing on disk.
 */
export async function downloadVerified(
  url: string,
  expectedSha256: string,
  destFile: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(
      `module download failed (HTTP ${res.status}) — the signed URL expires ` +
        `in minutes, so retry the command`,
    );
  }
  const data = new Uint8Array(await res.arrayBuffer());
  const actual = sha256Hex(data);
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error(
      `sha256 mismatch for the downloaded module (expected ${expectedSha256}, ` +
        `got ${actual}) — install aborted`,
    );
  }
  writeFileSync(destFile, data);
}

/* ----------------------------- entitlements ----------------------------- */

export interface Entitlement {
  slug: string;
  plan?: string;
}

export type EntitlementsResult =
  | { status: "active"; entitlements: Entitlement[] }
  | { status: "inactive"; code: string }
  | { status: "error"; message: string };

const entitlementItem = z.union([
  z.string(),
  z.object({ slug: z.string(), plan: z.string().optional() }),
]);
const entitlementsSchema = z.object({
  entitlements: z.array(entitlementItem).optional(),
  modules: z.array(entitlementItem).optional(),
});

/** `GET {registry}/entitlements` — never throws; errors become states. */
export async function fetchEntitlements(
  opts: { registry: string; licenseKey: string },
  fetchImpl: typeof fetch = fetch,
): Promise<EntitlementsResult> {
  try {
    const res = await fetchImpl(`${opts.registry}/entitlements`, {
      headers: { "X-Dream-License-Key": opts.licenseKey },
    });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = toRegistryError(res.status, body);
      if (err instanceof RegistryError) {
        return { status: "inactive", code: err.code };
      }
      return { status: "error", message: err.message };
    }
    const parsed = entitlementsSchema.safeParse(body);
    const items = parsed.success
      ? (parsed.data.entitlements ?? parsed.data.modules ?? [])
      : [];
    return {
      status: "active",
      entitlements: items.map((item) =>
        typeof item === "string" ? { slug: item } : item,
      ),
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/* -------------------------------- catalog ------------------------------- */

const catalogModuleSchema = z.object({
  slug: z.string(),
  name: z.string().optional(),
  latest: z.string().optional(),
  kitCompat: z.string().optional(),
  paid: z.boolean().optional(),
  plan: z.string().optional(),
  pricingUrl: z.string().optional(),
});
const catalogSchema = z.object({
  modules: z.array(catalogModuleSchema).optional(),
  /** Pre-rename registries used this key. */
  extensions: z.array(catalogModuleSchema).optional(),
});

export type CatalogModule = z.infer<typeof catalogModuleSchema>;

/** `GET {registry}/catalog?schema=2`. */
export async function fetchCatalog(
  registry: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CatalogModule[]> {
  const res = await fetchImpl(`${registry}/catalog?schema=2`);
  if (!res.ok) throw new Error(`catalog fetch failed (HTTP ${res.status})`);
  const parsed = catalogSchema.safeParse(await res.json());
  if (!parsed.success) return [];
  return parsed.data.modules ?? parsed.data.extensions ?? [];
}

/** The newest catalog version this kit can take, or null. */
export function latestCompatible(
  entry: CatalogModule | undefined,
  kitVersion: string = KIT_VERSION,
): string | null {
  if (!entry?.latest || !semver.valid(entry.latest)) return null;
  if (entry.kitCompat && !semver.satisfies(kitVersion, entry.kitCompat)) {
    return null;
  }
  return entry.latest;
}
