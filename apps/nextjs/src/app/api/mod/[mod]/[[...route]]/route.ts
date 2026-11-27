import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient as createBearerClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";
import type { ModRouteContext } from "@acme/mod-kit/server";
import { slidingWindow } from "@acme/config";
import {
  matchModRoute,
  MOD_HTTP_METHODS,
  modRateLimitBucket,
  routeRateLimit,
} from "@acme/mod-kit/server";

import { env, supabaseAnonKey } from "~/env";
import { isModuleEnabled } from "~/lib/mod/enabled";
import { hostServices } from "~/lib/mod/host-github";
import { createClient as createCookieClient } from "~/lib/supabase/server";
import {
  modPublicRoutes,
  modServerRoutes,
} from "~/mod/registry.server.generated";
// Side effect: lets modules use "Connect with …" (Meet Dream) connections.
import "~/lib/mod/connector-broker";

/**
 * The ONE server entry point for every module API route
 * (docs/MODULES-PLAN.md §2): /api/mod/<slug>/<path> resolves the slug in
 * the generated server registry, then runs host-owned middleware in a single
 * choke point — auth (both session styles), rate limiting, enablement —
 * before invoking the module's "METHOD /path" handler. This is how golden
 * rule #6 (authed, rate-limited server routes) holds for every module
 * endpoint; modules write zero auth code.
 *
 * Modules' `publicRoutes` (no session required) are dispatched here too,
 * still rate-limited and enablement-gated; those handlers verify their own
 * caller (a webhook signature, `isCronRequest`, a guest-checkout proof).
 */

// Shared budget across all of a user's module calls (60/min), unless a route
// sets its own with withRateLimit (@acme/mod-kit/server). In-memory per
// instance, same trade-off as /api/chat — swap for Redis/Upstash in prod
// if you need a global limit.
const hitsByBucket = new Map<string, number[]>();

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status });

/**
 * Authenticate either session style:
 *  - native: `Authorization: Bearer <access token>` (the EXPO_PUBLIC pattern),
 *  - web: the Supabase session cookie.
 * Both yield an RLS-scoped client — module queries run as the caller.
 *
 * Anonymous Supabase sessions (`is_anonymous` — the visitor identity minted
 * for favorites / guest checkout) are NOT authenticated here: they would
 * otherwise reach every module's authed routes, AI included (golden rule
 * #6). Flows that must serve them belong in a module's `publicRoutes`.
 */
async function authenticate(
  req: NextRequest,
  opts: { allowAnonymous?: boolean } = {},
) {
  const authHeader = req.headers.get("Authorization");
  const supabase = authHeader
    ? createBearerClient<Database>(
        env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseAnonKey(),
        {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        },
      )
    : await createCookieClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { user: null, supabase };
  if (user.is_anonymous && !opts.allowAnonymous)
    return { user: null, supabase };
  return { user, supabase };
}

// Guarded (lib/cms/payload-client.ts): fails fast while the CMS database is
// down/unprovisioned instead of hammering the pooler per request, and re-runs
// the DB bootstrap when a fresh deploy's boot attempt failed.
const getPayloadLazy = async () => {
  const { getPayloadClient } = await import("~/lib/cms/payload-client");
  return getPayloadClient();
};

const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

/** Spend one request from the route's budget; false once it's used up. */
function rateLimit(
  req: NextRequest,
  mod: string,
  match: { handler: unknown; key: string } | null,
  userId: string | null,
): boolean {
  const budget = modRateLimitBucket(
    match ? routeRateLimit(match.handler) : undefined,
    {
      route: `${mod} ${match?.key ?? ""}`,
      userId,
      ip: clientIp(req),
      req,
    },
  );
  if (!budget) return true;
  const { allowed, hits } = slidingWindow(
    hitsByBucket.get(budget.bucket) ?? [],
    Date.now(),
    budget.windowMs,
    budget.limit,
  );
  hitsByBucket.set(budget.bucket, hits);
  return allowed;
}

async function dispatch(
  req: NextRequest,
  { params }: { params: Promise<{ mod: string; route?: string[] }> },
): Promise<Response> {
  const { mod, route } = await params;

  const table = modServerRoutes[mod];
  const publicTable = modPublicRoutes[mod];
  if ((!table && !publicTable) || !(await isModuleEnabled(mod))) {
    return json(404, { error: "Not found" });
  }

  const path = `/${(route ?? []).join("/")}`;

  // PUBLIC routes first (manifest server.publicRoutes — e.g. guest checkout):
  // no session required; rate-limited per user when present, per IP otherwise
  // (or by the route's own withRateLimit).
  // Keys are exact, or `"METHOD /prefix/*"` wildcards (matchModRoute).
  const publicMatch = matchModRoute(publicTable, req.method, path);
  if (publicMatch) {
    // Either session style; anonymous visitors are allowed here.
    const { user, supabase } = await authenticate(req, {
      allowAnonymous: true,
    });
    if (!rateLimit(req, mod, publicMatch, user?.id ?? null)) {
      return json(429, { error: "Rate limit exceeded. Try again shortly." });
    }
    return publicMatch.handler(req, {
      user,
      supabase,
      params: publicMatch.params,
      getPayload: getPayloadLazy,
      host: hostServices,
    });
  }

  if (!table) return json(404, { error: "Not found" });

  const auth = await authenticate(req);
  if (!auth.user) return json(401, { error: "Unauthorized" });

  const match = matchModRoute(table, req.method, path);
  if (!rateLimit(req, mod, match, auth.user.id)) {
    return json(429, { error: "Rate limit exceeded. Try again shortly." });
  }
  if (!match) {
    const pathExists = MOD_HTTP_METHODS.some((m) =>
      matchModRoute(table, m, path),
    );
    return pathExists
      ? json(405, { error: "Method not allowed" })
      : json(404, { error: "Not found" });
  }

  const ctx: ModRouteContext = {
    user: auth.user,
    supabase: auth.supabase,
    params: match.params,
    getPayload: getPayloadLazy,
    host: hostServices,
  };

  // Streaming responses pass through untouched.
  return match.handler(req, ctx);
}

export {
  dispatch as GET,
  dispatch as POST,
  dispatch as PUT,
  dispatch as PATCH,
  dispatch as DELETE,
};
