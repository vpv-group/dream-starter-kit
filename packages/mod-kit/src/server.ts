import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { BasePayload } from "payload";

import type { Database } from "@acme/api";

/**
 * Server route contract for modules (docs/MODULES-PLAN.md §2).
 *
 * A module's `./server` entry (first line: `import "server-only"`) exports
 * `routes: ModRouteTable`. The host's catch-all dispatcher
 * (apps/nextjs/src/app/api/mod/[mod]/[[...route]]/route.ts) authenticates the
 * request (Supabase session cookie on web, `Authorization: Bearer` on native),
 * applies the shared rate limiter, checks the module is enabled, and only
 * then invokes the matching handler — module endpoints are authed +
 * rate-limited by construction (golden rule #6).
 */
export interface ModRouteContext {
  /** The authenticated Supabase user (the dispatcher rejects anonymous traffic). */
  user: User;
  /** RLS-scoped client bound to the caller's session — queries run as the user. */
  supabase: SupabaseClient<Database>;
  /**
   * Reserved for future route-pattern params; route keys are exact
   * "METHOD /path" strings today.
   */
  params: Record<string, string>;
  /**
   * Lazily resolve the host's Payload instance (for `getModuleSettings`,
   * Local API reads). Lazy so routes that never touch the CMS pay nothing.
   */
  getPayload: () => Promise<BasePayload>;
}

export type ModRouteHandler = (
  req: Request,
  ctx: ModRouteContext,
) => Response | Promise<Response>;

/**
 * Keys are exact `"METHOD /path"` strings, e.g. `"POST /stream"`,
 * `"GET /ping"`. The index route is `"GET /"`. Streaming responses pass
 * through the dispatcher untouched.
 */
export type ModRouteTable = Record<string, ModRouteHandler>;

/**
 * Context for PUBLIC module routes (`publicRoutes` export, manifest
 * `server.publicRoutes: true`): the dispatcher does NOT require a session —
 * `user` is null for anonymous callers — but still rate-limits (per user when
 * signed in, per IP otherwise) and gates on enablement. Reserve these for
 * flows that genuinely serve anonymous traffic (e.g. billing's guest
 * checkout); everything else belongs in the authed `routes` table (golden
 * rule #6). Signature-verified endpoints (Stripe webhooks) still belong in
 * edge functions or Payload plugin endpoints, not here.
 */
export interface ModPublicRouteContext {
  /** The caller, when a session exists — null for anonymous requests. */
  user: User | null;
  /** Cookie/anon-scoped client — RLS still applies to every query. */
  supabase: SupabaseClient<Database>;
  params: Record<string, string>;
  getPayload: () => Promise<BasePayload>;
}

export type ModPublicRouteHandler = (
  req: Request,
  ctx: ModPublicRouteContext,
) => Response | Promise<Response>;

export type ModPublicRouteTable = Record<string, ModPublicRouteHandler>;

export const MOD_HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;
export type ModHttpMethod = (typeof MOD_HTTP_METHODS)[number];
