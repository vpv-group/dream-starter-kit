import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient as createBearerClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";
import type { ModRouteContext } from "@acme/mod-kit/server";
import { slidingWindow } from "@acme/config";

import { env, supabaseAnonKey } from "~/env";
import { isModuleEnabled } from "~/lib/mod/enabled";
import { hostServices } from "~/lib/mod/host-services";
import { createClient as createCookieClient } from "~/lib/supabase/server";
import {
  modPublicRoutes,
  modServerRoutes,
} from "~/mod/registry.server.generated";

/**
 * The ONE server entry point for every module API route
 * (docs/MODULES-PLAN.md §2): /api/mod/<slug>/<path> resolves the slug in
 * the generated server registry, then runs host-owned middleware in a single
 * choke point — auth (both session styles), rate limiting, enablement —
 * before invoking the module's "METHOD /path" handler. This is how golden
 * rule #6 (authed, rate-limited server routes) holds for every module
 * endpoint; modules write zero auth code.
 *
 * Public/signature-verified endpoints (Stripe webhooks) do NOT go through
 * here by design — they live in edge functions or Payload plugin endpoints.
 */

// Shared budget across all of a user's module calls. In-memory per
// instance, same trade-off as /api/chat — swap for Redis/Upstash in prod
// if you need a global limit.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const hitsByUser = new Map<string, number[]>();

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

function rateLimit(key: string): boolean {
  const now = Date.now();
  const { allowed, hits } = slidingWindow(
    hitsByUser.get(key) ?? [],
    now,
    RATE_WINDOW_MS,
    RATE_LIMIT,
  );
  hitsByUser.set(key, hits);
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
  const key = `${req.method} ${path}`;

  // PUBLIC routes first (manifest server.publicRoutes — e.g. guest checkout):
  // no session required; rate-limited per user when present, per IP otherwise.
  const publicHandler = publicTable?.[key];
  if (publicHandler) {
    // Either session style; anonymous visitors are allowed here.
    const { user, supabase } = await authenticate(req, {
      allowAnonymous: true,
    });
    const limiterKey =
      user?.id ??
      `ip:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`;
    if (!rateLimit(limiterKey)) {
      return json(429, { error: "Rate limit exceeded. Try again shortly." });
    }
    return publicHandler(req, {
      user,
      supabase,
      params: {},
      getPayload: getPayloadLazy,
      host: hostServices,
    });
  }

  if (!table) return json(404, { error: "Not found" });

  const auth = await authenticate(req);
  if (!auth.user) return json(401, { error: "Unauthorized" });

  if (!rateLimit(auth.user.id)) {
    return json(429, { error: "Rate limit exceeded. Try again shortly." });
  }

  const handler = table[key];
  if (!handler) {
    const pathExists = Object.keys(table).some((k) => k.endsWith(` ${path}`));
    return pathExists
      ? json(405, { error: "Method not allowed" })
      : json(404, { error: "Not found" });
  }

  const ctx: ModRouteContext = {
    user: auth.user,
    supabase: auth.supabase,
    params: {},
    getPayload: getPayloadLazy,
    host: hostServices,
  };

  // Streaming responses pass through untouched.
  return handler(req, ctx);
}

export {
  dispatch as GET,
  dispatch as POST,
  dispatch as PUT,
  dispatch as PATCH,
  dispatch as DELETE,
};
