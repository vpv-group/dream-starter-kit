import { z } from "zod/v4";

import type { ConnectorResult, ConnectorToken } from "@acme/mod-kit/server";

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
  if (p.code === "not_connected")
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
