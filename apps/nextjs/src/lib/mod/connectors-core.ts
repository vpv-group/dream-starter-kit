import { z } from "zod/v4";

import type { ConnectorResult, ConnectorStatus } from "@acme/mod-kit/server";

import type { CallOpts, UpdatesProblem } from "./updates-core";
import { call } from "./updates-core";

/**
 * Connector protocol with meetdream.com (pure: injected fetch, unit tested in
 * connectors-core.test.ts). Meet Dream runs the platforms ("Meet Dream AI" —
 * for Stripe, a Stripe Connect platform) and keeps every provider credential;
 * a site authenticates with its site license key and Meet Dream acts on the
 * site's OWN connected account only. The kit treats every provider the same:
 *
 * - `POST /connect/<target>/start`               → `{ url }` (onboarding or
 *   consent; Meet Dream finishes it and returns to `returnTo?<target>=connected`)
 * - `POST /sites/connectors/<target>/status`     → `ConnectorStatus`
 *   (404/`not_connected` when the site never connected)
 * - `ANY  /sites/connectors/<target>/api/<path>` → the provider's API, called
 *   by Meet Dream for this site (response passed through unchanged)
 * - `POST /sites/connectors/<target>/webhook-target` `{ url }` → `{ secret }`
 *   (Meet Dream delivers the provider's events there, signed with `secret`)
 * - `POST /sites/connectors/<target>/disconnect` → stop brokering
 *
 * Stripe is the first target (docs/STRIPE.md → Connect with Stripe).
 */

const statusSchema = z.object({
  accountId: z.string().min(1),
  accountName: z.string().nullable().optional(),
  livemode: z.boolean().nullable().optional(),
  publishableKey: z.string().nullable().optional(),
  ready: z.boolean().optional(),
  onboardingUrl: z.string().nullable().optional(),
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

export async function connectorStatus(
  opts: CallOpts,
  target: string,
): Promise<ConnectorResult<{ connection: ConnectorStatus }>> {
  const res = await call(opts, `/sites/connectors/${enc(target)}/status`, {
    method: "POST",
  });
  if (!("ok" in res)) return problem(res);
  const parsed = statusSchema.safeParse(res.body);
  return parsed.success
    ? { status: "ok", connection: parsed.data }
    : { status: "error", message: "Unexpected answer from Meet Dream." };
}

/**
 * One provider API call made by Meet Dream for this site. The provider's
 * response comes back unchanged (status, headers, body), so the provider's
 * own SDK can parse it; only a network failure rejects.
 */
export async function connectorForward(
  opts: CallOpts,
  target: string,
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
): Promise<Response> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(init.headers ?? {})) {
    // The provider credential is Meet Dream's: never send one from here.
    if (k.toLowerCase() === "authorization") continue;
    headers[k] = v;
  }
  headers["X-Dream-License-Key"] = opts.siteKey;
  return (opts.fetchImpl ?? fetch)(
    `${opts.registry.replace(/\/$/, "")}/sites/connectors/${enc(target)}/api${
      path.startsWith("/") ? path : `/${path}`
    }`,
    {
      method: init.method,
      headers,
      ...(init.body === undefined ? {} : { body: init.body }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    },
  );
}

export async function connectorWebhookTarget(
  opts: CallOpts,
  target: string,
  url: string,
): Promise<ConnectorResult<{ secret: string }>> {
  const res = await call(
    opts,
    `/sites/connectors/${enc(target)}/webhook-target`,
    { method: "POST", body: { url } },
  );
  if (!("ok" in res)) return problem(res);
  const parsed = z.object({ secret: z.string().min(1) }).safeParse(res.body);
  return parsed.success
    ? { status: "ok", secret: parsed.data.secret }
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
