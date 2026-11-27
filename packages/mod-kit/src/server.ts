import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { BasePayload } from "payload";
import type { z } from "zod";

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
/**
 * GitHub, as connected through the Meet Dream AI GitHub App (/admin →
 * Updates). The host mints a short-lived installation token for the ONE
 * connected repository; modules never see it. `api()` is limited to that
 * repository's issue and label endpoints (plus `GET ""`, the repo itself),
 * so a module can't push code or touch workflows.
 */
export interface ModHostGithub {
  /** Whether a token can be minted right now, and for which `owner/repo`. */
  status(): Promise<
    | { connected: true; repo: string }
    | { connected: false; reason: string; message: string }
  >;
  /**
   * Call `https://api.github.com/repos/<repo><path>`. `path` must be `""`
   * (GET only), or start with `/issues` or `/labels`; anything else is
   * answered 403 without contacting GitHub. 503 `github_not_connected`
   * when no token can be minted.
   */
  api(path: string, init?: RequestInit): Promise<Response>;
  /**
   * GitHub issue search scoped to the connected repo (`is:issue repo:<repo>`
   * are appended to `query`).
   */
  searchIssues(query: string, perPage?: number): Promise<Response>;
}

/** Host capabilities modules may use (never secrets). */
export interface ModHostServices {
  github: ModHostGithub;
}

export interface ModRouteContext {
  /**
   * The authenticated, non-anonymous Supabase user. The dispatcher answers
   * 401 to anonymous sessions on these routes; flows that must serve
   * anonymous users belong in `publicRoutes`.
   */
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
  /** Host services (GitHub via the Meet Dream AI App). */
  host: ModHostServices;
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
  /** Host services (GitHub via the Meet Dream AI App). */
  host: ModHostServices;
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
/* Remote MCP server contributions (manifest `server.mcp: true`)               */
/* -------------------------------------------------------------------------- */

/**
 * What a module's MCP tool runs with. The /mcp route has already verified the
 * OAuth token and that the caller is CMS staff (admin/editor/author). Supabase
 * data has no user session here, so `admin` is the SERVICE-ROLE client: tools
 * must check whatever finer rule they need (e.g. `profiles.is_staff` for
 * `userId`) before reading or writing, and attribute writes to `userId`.
 */
export interface ModMcpContext {
  /** The caller's Supabase user id. */
  userId: string;
  /** The caller's `cms.users` row (id + roles) for Payload Local API calls. */
  cmsUser: { id: number | string; roles?: string[] | null } & Record<
    string,
    unknown
  >;
  payload: BasePayload;
  /** Service-role client — bypasses RLS. Server-only (golden rule #2). */
  admin: SupabaseClient<Database>;
  /** Public app origin, for absolute links. */
  origin: string;
  host: ModHostServices;
}

export interface ModMcpTool<S extends z.ZodRawShape = z.ZodRawShape> {
  /** Must start with `<slug>_`, e.g. `feedback_search_posts`. */
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  /** Marks the tool read-only for clients that show write warnings. */
  readOnly?: boolean;
  /** Return any JSON-serializable value; throw to report an error. */
  run: (args: z.infer<z.ZodObject<S>>, ctx: ModMcpContext) => Promise<unknown>;
}

/** Typed helper: infers `args` from `inputSchema`. */
export function defineMcpTool<S extends z.ZodRawShape>(
  tool: ModMcpTool<S>,
): ModMcpTool {
  return tool as unknown as ModMcpTool;
}

/**
 * A Payload collection the MCP's generic content tools (list_collections,
 * *_content, search/fetch) may operate on. Access is still enforced by the
 * collection's own Payload rules, as the calling staff user.
 */
export interface ModMcpCollection {
  slug: string;
  label: string;
  group: string;
  titleField: string;
  searchFields: string[];
  publicPath?: (doc: Record<string, unknown>) => string | null;
  chatgptSearch?: boolean;
}

export interface ModMcpExtension {
  tools?: ModMcpTool[];
  collections?: ModMcpCollection[];
  /** One sentence appended to the server's instructions. */
  instructions?: string;
}

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

/** A site's connection to a provider through Meet Dream (e.g. Stripe Connect). */
export interface ConnectorStatus {
  /** The provider account this site acts as, e.g. a Stripe `acct_…`. */
  accountId: string;
  /** Account display name, when the provider exposes one. */
  accountName?: string | null;
  livemode?: boolean | null;
  /**
   * Public (client-safe) key the browser uses with `accountId` — for Stripe
   * Connect, the PLATFORM's publishable key (direct charges load Stripe.js
   * with `{ stripeAccount: accountId }`).
   */
  publishableKey?: string | null;
  /** The account can take payments (onboarding finished). */
  ready?: boolean;
  /** Where the owner finishes onboarding while it isn't `ready`. */
  onboardingUrl?: string | null;
}

/**
 * The host's link to meetdream.com for connections brokered by the Meet
 * Dream platforms (GitHub for updates, Stripe for billing). Modules never see
 * the site license key or any provider secret: Meet Dream keeps the
 * provider credentials and performs this site's provider API calls itself
 * (`forward`), scoped to the site's own connected account.
 */
export interface ConnectorBroker {
  /** Start connecting; the browser opens `url` and returns to `returnTo`. */
  startConnect(
    target: string,
    returnTo: string,
    opts?: { mode?: "test" | "live" },
  ): Promise<ConnectorResult<{ url: string }>>;
  /** The site's connection to `target`. */
  status(
    target: string,
  ): Promise<ConnectorResult<{ connection: ConnectorStatus }>>;
  /**
   * One provider API request made by Meet Dream on this site's behalf
   * (`path` is the provider's, e.g. `/v1/products`). Returns the provider's
   * response unchanged; rejects only when Meet Dream can't be reached.
   */
  forward(
    target: string,
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ): Promise<Response>;
  /**
   * Where Meet Dream delivers the provider's events for this site, and the
   * secret it signs them with (in the provider's own signature format).
   */
  setWebhookTarget(
    target: string,
    url: string,
  ): Promise<ConnectorResult<{ secret: string }>>;
  /** Stop brokering `target` for this site. */
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
