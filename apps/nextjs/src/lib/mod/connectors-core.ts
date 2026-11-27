import { z } from "zod/v4";

import type {
  ConnectorResult,
  ConnectorToken,
  GithubSyncRepo,
  GithubSyncToken,
} from "@acme/mod-kit/server";

import type { CallOpts, UpdatesProblem } from "./updates-core";
import { call } from "./updates-core";

/**
 * Connector protocol with meetdream.com (pure: injected fetch, unit tested in
 * connectors-core.test.ts). Meet Dream runs the OAuth apps ("Meet Dream AI")
 * and keeps their client secrets + refresh tokens; a site only ever holds a
 * short-lived credential for its OWN connected account, fetched with its site
 * license key. The kit treats every provider the same:
 *
 * - `POST /connect/<target>/start`             → `{ url }` (browser goes to the
 *   provider's consent screen; Meet Dream's registered redirect URI finishes
 *   the exchange, then bounces back to `returnTo?<target>=connected`)
 * - `POST /sites/connectors/<target>/token`    → `ConnectorToken`
 *   (404/`not_connected` when the site never connected)
 * - `POST /sites/connectors/<target>/disconnect` → revoke
 *
 * Stripe is the first target (docs/STRIPE.md → Connect with Stripe).
 */

const tokenSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().nullable().default(null),
  accountId: z.string().min(1),
  accountName: z.string().nullable().optional(),
  livemode: z.boolean().optional(),
  publishableKey: z.string().nullable().optional(),
  onBehalfOf: z.string().nullable().optional(),
});

function problem(p: UpdatesProblem): ConnectorResult<never> {
  if (p.status === "no-site-key")
    return { status: "no_key", message: p.message };
  if (p.code === "not_connected" || p.code === "not_granted")
    return { status: "not_connected", message: p.message };
  return { status: "error", message: p.message };
}

const enc = encodeURIComponent;

export async function connectorStartUrl(
  opts: CallOpts,
  target: string,
  returnTo: string,
  mode?: "test" | "live",
): Promise<ConnectorResult<{ url: string }>> {
  const res = await call(opts, `/connect/${enc(target)}/start`, {
    method: "POST",
    body: mode ? { returnTo, mode } : { returnTo },
  });
  if (!("ok" in res)) return problem(res);
  const parsed = z.object({ url: z.url() }).safeParse(res.body);
  return parsed.success
    ? { status: "ok", url: parsed.data.url }
    : { status: "error", message: "Unexpected answer from Meet Dream." };
}

export async function connectorToken(
  opts: CallOpts,
  target: string,
): Promise<ConnectorResult<{ token: ConnectorToken }>> {
  const res = await call(opts, `/sites/connectors/${enc(target)}/token`, {
    method: "POST",
  });
  if (!("ok" in res)) return problem(res);
  const parsed = tokenSchema.safeParse(res.body);
  return parsed.success
    ? { status: "ok", token: parsed.data }
    : { status: "error", message: "Unexpected answer from Meet Dream." };
}

export async function connectorDisconnect(
  opts: CallOpts,
  target: string,
): Promise<ConnectorResult<object>> {
  const res = await call(opts, `/sites/connectors/${enc(target)}/disconnect`, {
    method: "POST",
  });
  if (!("ok" in res)) return problem(res);
  return { status: "ok" };
}

/* -------------------------------------------------------------------------- */
/* GitHub issue sync (ConnectorBroker.githubSync). The site's owner grants     */
/* repositories on meetdream.com; the site gets one-hour tokens for those      */
/* repositories only, and meetdream.com forwards their webhooks.               */
/* -------------------------------------------------------------------------- */

const UNEXPECTED = {
  status: "error",
  message: "Unexpected answer from Meet Dream.",
} as const;

export async function githubSyncStart(
  opts: CallOpts,
  returnTo: string,
  forwardPath: string,
): Promise<ConnectorResult<{ url: string }>> {
  const res = await call(opts, "/connect/github/sync/start", {
    method: "POST",
    body: { returnTo, forwardPath },
  });
  if (!("ok" in res)) return problem(res);
  const parsed = z.object({ url: z.url() }).safeParse(res.body);
  return parsed.success ? { status: "ok", url: parsed.data.url } : UNEXPECTED;
}

const syncAccessSchema = z.object({
  repos: z.array(
    z.object({
      repo: z.string().min(1),
      repoId: z.string().min(1),
      installationId: z.string().min(1),
    }),
  ),
  forwardPath: z.string().nullable().default(null),
  forwardSecret: z.string().nullable().default(null),
});

export async function githubSyncAccess(opts: CallOpts): Promise<
  ConnectorResult<{
    repos: GithubSyncRepo[];
    forwardPath: string | null;
    forwardSecret: string | null;
  }>
> {
  const res = await call(opts, "/sites/github/sync");
  if (!("ok" in res)) return problem(res);
  const parsed = syncAccessSchema.safeParse(res.body);
  return parsed.success ? { status: "ok", ...parsed.data } : UNEXPECTED;
}

const syncTokenSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().min(1),
  repo: z.string().min(1),
  permissions: z.record(z.string(), z.string()).default({}),
});

export async function githubSyncToken(
  opts: CallOpts,
  repo: string,
): Promise<ConnectorResult<{ token: GithubSyncToken }>> {
  const res = await call(opts, "/sites/github/sync-token", {
    method: "POST",
    body: { repo },
  });
  if (!("ok" in res)) return problem(res);
  const parsed = syncTokenSchema.safeParse(res.body);
  return parsed.success ? { status: "ok", token: parsed.data } : UNEXPECTED;
}

export async function githubSyncRevoke(
  opts: CallOpts,
  repo: string,
): Promise<ConnectorResult<{ revoked: boolean }>> {
  const res = await call(opts, "/sites/github/sync", {
    method: "DELETE",
    body: { repo },
  });
  if (!("ok" in res)) return problem(res);
  const parsed = z.object({ revoked: z.boolean() }).safeParse(res.body);
  return parsed.success
    ? { status: "ok", revoked: parsed.data.revoked }
    : UNEXPECTED;
}

/**
 * Per-target token cache, refreshed 5 minutes before expiry (tokens without
 * an expiry are kept until `clear`).
 */
export function connectorTokenCache(now: () => number = Date.now) {
  const cached = new Map<string, ConnectorToken>();
  return {
    get(target: string): ConnectorToken | null {
      const t = cached.get(target);
      if (!t) return null;
      if (t.expiresAt === null) return t;
      return Date.parse(t.expiresAt) - now() > 5 * 60_000 ? t : null;
    },
    set(target: string, token: ConnectorToken) {
      cached.set(target, token);
    },
    clear(target: string) {
      cached.delete(target);
    },
  };
}
