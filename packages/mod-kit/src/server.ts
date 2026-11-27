import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { BasePayload } from "payload";

import type { Database } from "@acme/api";
import type { AuthSettings } from "@acme/app";

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
 * checkout) or verify their own caller — signature-checked webhooks (Stripe,
 * Slack), cron routes (`isCronRequest`). Everything else belongs in the
 * authed `routes` table (golden rule #6).
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

/* -------------------------------------------------------------------------- */
/* Adapters — modules that plug into another module's extension point          */
/* (manifest `adapter.for`). The target calls OUT to them; it never imports    */
/* its adapters. The generated server + payload registries register every      */
/* installed adapter here at load time (idempotent).                           */
/* -------------------------------------------------------------------------- */

export interface ModAdapterEntry<T = unknown> {
  /** The adapter module's slug, e.g. "billing-adapter-stripe". */
  slug: string;
  /** Its `./server` `adapter` export (the target's contract). */
  adapter: T;
}

/**
 * How the generated registries hand adapters over: a lazy loader per adapter
 * (`() => import("<pkg>/server")`). Lazy because the Payload registry is also
 * loaded by the Payload CLI (migrate, gen-types) in plain Node, where an
 * adapter's `server-only` entry must not be evaluated.
 */
export interface ModAdapterLoader {
  slug: string;
  load: () => Promise<{ adapter?: unknown }>;
}

const ADAPTERS_KEY = Symbol.for("acme.mod-kit.adapters");
interface AdapterStore {
  loaders: Map<string, ModAdapterLoader[]>;
  resolved: Map<string, Promise<ModAdapterEntry[]>>;
}

/**
 * One store per process, shared across bundles: Next can evaluate the same
 * module in several graphs (route handlers, Payload config), so a plain
 * module-level Map could exist twice. globalThis keeps them in agreement.
 */
function adapterStore(): AdapterStore {
  const g = globalThis as { [ADAPTERS_KEY]?: AdapterStore };
  g[ADAPTERS_KEY] ??= { loaders: new Map(), resolved: new Map() };
  return g[ADAPTERS_KEY];
}

/**
 * Register adapters by target slug — called by the generated registries
 * (`modAdapterLoaders`). Replaces the target's list, so re-running is
 * harmless.
 */
export function registerModAdapters(
  byTarget: Record<string, ModAdapterLoader[]>,
): void {
  const store = adapterStore();
  for (const [target, loaders] of Object.entries(byTarget)) {
    store.loaders.set(target, [...loaders]);
    store.resolved.delete(target);
  }
}

/**
 * The installed adapters for a target module, in slug order (loaded once per
 * process). Runtime enable/disable is the caller's call: contract methods
 * should check their own settings (e.g. an `enabled` toggle), and the host's
 * `kit-modules.enabled` gates the adapter's own routes.
 */
export async function getModAdapters<T>(
  target: string,
): Promise<ModAdapterEntry<T>[]> {
  const store = adapterStore();
  let pending = store.resolved.get(target);
  if (!pending) {
    const loaders = store.loaders.get(target) ?? [];
    pending = Promise.all(
      loaders.map(async (l) => ({
        slug: l.slug,
        adapter: (await l.load()).adapter,
      })),
    ).then((rows) => rows.filter((r) => r.adapter !== undefined));
    // A failed load (e.g. an adapter evaluated outside Next) is retried on
    // the next call instead of being cached.
    pending.catch(() => store.resolved.delete(target));
    store.resolved.set(target, pending);
  }
  return (await pending) as ModAdapterEntry<T>[];
}

/** Test helper: register already-loaded adapters for a target. */
export function setModAdaptersForTest(
  target: string,
  entries: ModAdapterEntry[],
): void {
  registerModAdapters({
    [target]: entries.map((e) => ({
      slug: e.slug,
      load: () => Promise.resolve({ adapter: e.adapter }),
    })),
  });
}

/* -------------------------------------------------------------------------- */
/* Services — functions a module exposes to the HOST (manifest               */
/* `server.services`), surfaced as the generated `modServices[slug]`.          */
/* -------------------------------------------------------------------------- */

/** A module's `services` export: plain async functions, typed by the module. */
export type ModServices = Record<string, (...args: never[]) => unknown>;

/* -------------------------------------------------------------------------- */
/* Connector broker — the host's link to meetdream.com for OAuth connections   */
/* brokered by the Meet Dream AI apps (GitHub today, Stripe, …). The host      */
/* registers it at load (it holds the site license key); modules only see      */
/* this interface, never the key.                                              */
/* -------------------------------------------------------------------------- */

export type ConnectorResult<T> =
  | ({ status: "ok" } & T)
  | { status: "no_key" | "not_connected" | "error"; message: string };

export interface ConnectorToken {
  /** Bearer credential for the provider API (short-lived where supported). */
  accessToken: string;
  /** ISO time the token stops working; null = until revoked. */
  expiresAt: string | null;
  /** Provider account id, e.g. a Stripe `acct_…`. */
  accountId: string;
  /** Account display name, when the provider exposes one. */
  accountName?: string | null;
  livemode?: boolean;
  /** Public (client-safe) key for the connected account, e.g. Stripe's pk. */
  publishableKey?: string | null;
  /** Act-as header value when the token is a platform credential. */
  onBehalfOf?: string | null;
}

export interface ConnectorBroker {
  /** Start the OAuth flow; the browser opens `url` and returns to `returnTo`. */
  startConnect(
    target: string,
    returnTo: string,
    opts?: { mode?: "test" | "live" },
  ): Promise<ConnectorResult<{ url: string }>>;
  /** A usable credential for the site's connection to `target`. */
  token(target: string): Promise<ConnectorResult<{ token: ConnectorToken }>>;
  /** Revoke the site's connection to `target`. */
  disconnect(target: string): Promise<ConnectorResult<object>>;
}

const BROKER_KEY = Symbol.for("acme.mod-kit.connector-broker");

/** Called once by the host (it owns the site key + meetdream.com client). */
export function registerConnectorBroker(broker: ConnectorBroker): void {
  (globalThis as { [BROKER_KEY]?: ConnectorBroker })[BROKER_KEY] = broker;
}

/**
 * The host's broker, or null when none is registered (tests, CLIs, or a host
 * built before kit 2.6) — callers degrade to "not connected".
 */
export function getConnectorBroker(): ConnectorBroker | null {
  return (globalThis as { [BROKER_KEY]?: ConnectorBroker })[BROKER_KEY] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Host services — server-side core helpers a module's RSC pages may need      */
/* (the viewer's RLS session, the auth settings, the brand name). Module pages */
/* can't import host code, so the host registers these once at load, next to  */
/* the connector broker; a module calls getHostServices() and handles null.    */
/* -------------------------------------------------------------------------- */

export interface HostServices {
  /** The viewer's Supabase client (cookie session, RLS applies). */
  getSessionClient(): Promise<SupabaseClient<Database>>;
  /** The staff-configured auth settings (`authentication-settings` global). */
  getAuthSettings(): Promise<AuthSettings>;
  /** Site branding; `appName` at least. */
  getBranding(): Promise<{ appName: string }>;
}

const HOST_SERVICES_KEY = Symbol.for("acme.mod-kit.host-services");

/** Called once by the host when its server code loads. */
export function registerHostServices(services: HostServices): void {
  (globalThis as { [HOST_SERVICES_KEY]?: HostServices })[HOST_SERVICES_KEY] =
    services;
}

/** The host's services, or null when none are registered (tests, CLIs). */
export function getHostServices(): HostServices | null {
  return (
    (globalThis as { [HOST_SERVICES_KEY]?: HostServices })[HOST_SERVICES_KEY] ??
    null
  );
}
