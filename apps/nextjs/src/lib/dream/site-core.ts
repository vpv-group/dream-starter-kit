import { isIP } from "node:net";

/**
 * Free site license (docs/MODULES.md → Site license): this deployment
 * registers its domain with the Dream registry (meetdream.com) and gets a
 * free SITE license key — kit updates + free modules for life. The founder
 * can later put their meetdream.com plan on the site; they never have to
 * create or paste a key themselves.
 *
 * Pure core: no env, no Payload, no `server-only`, injected fetch — so it's
 * unit tested directly (site-core.test.ts). `site.ts` wires it to the app.
 *
 * Flow (the registry side is meet-dream docs/PAID-MODULES.md → Sites):
 *   1. POST {registry}/sites/challenge {domain}      → signed challenge
 *   2. store its nonce; /.well-known/dream-site.json serves it
 *   3. POST {registry}/sites/register {challenge, owner, staff, …}
 *      → the registry fetches the nonce from this domain, then returns
 *        the site key once
 *   4. daily: POST {registry}/sites/heartbeat (site key) — kit version +
 *      new staff; a 401 (key rotated/revoked) re-registers.
 */

export const DREAM_SITE_GLOBAL = "dream-site";
export const DAY_MS = 24 * 60 * 60_000;

export interface DreamSiteState {
  nonce?: string | null;
  licenseKey?: string | null;
  licenseKeyPrefix?: string | null;
  domain?: string | null;
  registeredAt?: string | null;
  lastReportedAt?: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
}

export interface SitePeople {
  /** The founder: the earliest admin. */
  owner: string | null;
  /** Other admins/editors. */
  staff: string[];
}

export interface SiteSyncDeps {
  /** Registry base, e.g. https://www.meetdream.com/api/mod/modules/v1 */
  registry: string;
  /** This deployment's public host, or null (local/dev → never registers). */
  domain: string | null;
  /** DREAM_TELEMETRY !== "off". */
  telemetry: boolean;
  kitVersion: string;
  repo: string | null;
  people: () => Promise<SitePeople>;
  load: () => Promise<DreamSiteState>;
  save: (patch: Partial<DreamSiteState>) => Promise<void>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export type SiteSyncResult =
  | {
      status: "skipped";
      reason: "opted_out" | "no_public_domain" | "throttled" | "no_owner";
    }
  | { status: "registered"; keyPrefix: string }
  | { status: "reported" }
  | { status: "error"; message: string };

const RESERVED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".test",
  ".example",
  ".invalid",
];

/**
 * The public hostname of a site URL, or null when it can't be reached from
 * the internet (localhost, IPs, reserved TLDs) — those never register.
 */
export function publicDomain(siteUrl: string): string | null {
  let host: string;
  try {
    host = new URL(siteUrl).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
  if (!host.includes(".") || host === "localhost") return null;
  if (isIP(host.replace(/^\[|\]$/g, "")) !== 0) return null;
  if (RESERVED_SUFFIXES.some((s) => host.endsWith(s))) return null;
  return host;
}

class RegistryCallError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(
  fetchImpl: typeof fetch,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new RegistryCallError(
      0,
      `registry unreachable (${(err as Error).message})`,
    );
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // The registry's error shape is { error: code, code, message } — `error`
    // repeats the machine code; the human sentence is in `message`.
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const code = str(json.code) ?? str(json.error) ?? `http_${res.status}`;
    const errorText = str(json.error);
    const msg =
      str(json.message) ??
      (errorText && errorText !== code ? errorText : null) ??
      "request failed";
    throw new RegistryCallError(res.status, `${code}: ${msg}`);
  }
  return json as T;
}

interface Challenge {
  domain: string;
  nonce: string;
  expiresAt: number;
  signature: string;
}

/**
 * Register or report in. Never throws — problems land in `lastError` and
 * the result. `force` skips the throttle (first seed); otherwise at most one
 * attempt per `minIntervalMs`.
 */
export async function syncSite(
  deps: SiteSyncDeps,
  opts: { force?: boolean; minIntervalMs?: number } = {},
): Promise<SiteSyncResult> {
  if (!deps.telemetry) return { status: "skipped", reason: "opted_out" };
  const domain = deps.domain;
  if (!domain) return { status: "skipped", reason: "no_public_domain" };
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;

  try {
    const state = await deps.load();
    const last = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : NaN;
    if (
      !opts.force &&
      Number.isFinite(last) &&
      now() - last < (opts.minIntervalMs ?? DAY_MS)
    ) {
      return { status: "skipped", reason: "throttled" };
    }
    const people = await deps.people();
    if (!people.owner) return { status: "skipped", reason: "no_owner" };
    await deps.save({ lastAttemptAt: new Date(now()).toISOString() });

    const base = deps.registry.replace(/\/$/, "");
    const meta = {
      kitVersion: deps.kitVersion,
      ...(deps.repo ? { repo: deps.repo } : {}),
    };

    // Already registered for this domain → heartbeat with the site key.
    if (state.licenseKey && state.domain === domain) {
      try {
        await call(
          fetchImpl,
          `${base}/sites/heartbeat`,
          { ...meta, staff: people.staff },
          { "X-Dream-License-Key": state.licenseKey },
        );
        await deps.save({
          lastReportedAt: new Date(now()).toISOString(),
          lastError: null,
        });
        return { status: "reported" };
      } catch (err) {
        // A rotated/revoked key (e.g. the domain re-registered elsewhere)
        // falls through to a fresh registration; anything else is an error.
        if (!(err instanceof RegistryCallError) || err.status !== 401)
          throw err;
      }
    }

    const challenge = await call<Challenge>(
      fetchImpl,
      `${base}/sites/challenge`,
      {
        domain,
      },
    );
    await deps.save({ nonce: challenge.nonce });
    const out = await call<{ licenseKey: string; keyPrefix: string }>(
      fetchImpl,
      `${base}/sites/register`,
      {
        ...meta,
        challenge,
        owner: { email: people.owner },
        staff: people.staff,
      },
    );
    const at = new Date(now()).toISOString();
    await deps.save({
      nonce: null,
      licenseKey: out.licenseKey,
      licenseKeyPrefix: out.keyPrefix,
      domain,
      registeredAt: at,
      lastReportedAt: at,
      lastError: null,
    });
    return { status: "registered", keyPrefix: out.keyPrefix };
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await deps.save({ nonce: null, lastError: message }).catch(() => undefined);
    return { status: "error", message };
  }
}
