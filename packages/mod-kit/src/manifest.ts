import { z } from "zod/v4";

/**
 * Module manifest — the typed contract between a module and the host
 * (see docs/MODULES-PLAN.md §1.4). The manifest is consumed ONLY by codegen
 * (`pnpm mod sync` loads `modules/<slug>/module.config.ts` at sync time);
 * client bundles never import it — sync bakes nav/routes/widgets into the
 * generated registries as literals.
 */

/** Module slug rule: 2–31 chars, lowercase, starts with a letter. */
export const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;

/** Plain semver version (manifest version = git tag = package.json version). */
export const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const navLeafSchema = z.object({
  title: z.string().min(1),
  href: z.string().startsWith("/"),
  /** Icon name resolved through the generated icon map (graceful fallback). */
  icon: z.string().min(1).optional(),
  /** Menu sort order — lower first. Core entries use 10, 20, 30, … */
  order: z.number().int().default(100),
  /**
   * Who sees the entry by default: everyone signed in, only staff
   * (`profiles.is_staff`), or only non-staff ("members" — e.g. a client
   * portal's own pages). Seeded into the nav item's `audience` once; staff
   * own it in /admin → Navigation afterwards. "members" needs kit ≥ 2.5.
   */
  audience: z.enum(["everyone", "staff", "members"]).default("everyone"),
});

const navEntrySchema = navLeafSchema.extend({
  /**
   * Web only: entries listed under this one as a collapsible submenu (one
   * level deep). The parent row then only opens and closes the submenu.
   * Each child becomes its own nav item, which staff can rename, reorder,
   * move or turn off. Ignored on native. Needs kit ≥ 2.5.
   */
  children: z.array(navLeafSchema).default([]),
});

const routeEntrySchema = z.object({
  /** Route path relative to the mount, Expo/Next dynamic-segment syntax. "" = index. */
  path: z.string(),
  /** Named export from the `./web` (or `./native`) entry to mount. */
  component: z.string().min(1),
  /** Web layout group for the generated stub: authed shell (default) or public. */
  area: z.enum(["app", "public"]).default("app"),
  /**
   * Absolute mount override instead of /a/<slug>/<path> (e.g. billing claims
   * "/billing", dashboard claims "/a"). Validated against the reserved core
   * list and cross-module collisions. On native, "index" mounts the home
   * screen.
   */
  mount: z.string().optional(),
  /**
   * Web only: the component is a Server Component living in the module's
   * `./web-server` entry (may use the Payload Local API / node modules).
   * `./web` must stay CLIENT-safe — the client registry imports it for
   * widgets, so server imports there would leak into client chunks.
   */
  rsc: z.boolean().default(false),
});

export const moduleManifestSchema = z.object({
  slug: z.string().regex(SLUG_RE, "slug must match ^[a-z][a-z0-9-]{1,30}$"),
  name: z.string().min(1),
  version: z.string().regex(SEMVER_RE, "version must be plain semver"),
  /** Semver range of kit versions this module supports (e.g. ">=2.0.0 <3"). */
  kitCompat: z.string().min(1),
  description: z.string().optional(),
  /** Slugs of modules this one depends on (service imports + DML access). */
  requires: z.array(z.string().regex(SLUG_RE)).default([]),
  platforms: z
    .object({
      web: z.boolean().default(true),
      native: z.boolean().default(true),
    })
    .prefault({}),
  /** Nav DEFAULTS — seeded into the CMS-driven menu on install, staff-editable after. */
  nav: z
    .object({
      web: z.array(navEntrySchema).default([]),
      // Native menus are flat (tab bar + More), so no `children` there.
      native: z.array(navLeafSchema).default([]),
    })
    .prefault({}),
  routes: z
    .object({
      web: z.array(routeEntrySchema).default([]),
      native: z.array(routeEntrySchema).default([]),
    })
    .prefault({}),
  /** Optional dashboard widget — export names from ./web and ./native. */
  widgets: z
    .object({
      web: z.string().min(1).optional(),
      native: z.string().min(1).optional(),
    })
    .prefault({}),
  server: z
    .object({
      /** `./server` exports `routes: ModRouteTable`, served at /api/mod/<slug>/…. */
      routes: z.boolean().default(false),
      /**
       * `./server` also exports `publicRoutes: ModPublicRouteTable` — served
       * WITHOUT requiring a session (still rate-limited + enablement-gated).
       * Only for genuinely anonymous flows (e.g. guest checkout).
       */
      publicRoutes: z.boolean().default(false),
      /** Edge function directory names — must be prefixed `<slug>-`. */
      edgeFunctions: z.array(z.string().min(1)).default([]),
      /**
       * `./server` also exports `services` — a plain object of functions the
       * HOST calls through the generated `modServices[slug]` (e.g. billing's
       * `getViewerEntitlement`, `onAccountDelete`, `onUserMerge`). The host
       * never imports a module directly; this is its typed seam. Needs kit ≥ 2.6.
       */
      services: z.boolean().default(false),
    })
    .prefault({}),
  database: z
    .object({
      /** Every public-schema table the module owns — must be `mod_<slug>_*`. */
      tables: z.array(z.string().min(1)).default([]),
      /**
       * Tables owned elsewhere this module may DML (never DDL): tables of
       * modules it `requires` (e.g. reminders → mod_notifications) or the
       * core DML whitelist (e.g. billing → tags/user_tags). Validated by sync.
       */
      dml: z.array(z.string().min(1)).default([]),
      /**
       * Foreign tables this module attaches `mod_<slug>_*` triggers to:
       * core hook-points (organizations, memberships, invitations, profiles,
       * auth_events) or tables of modules it `requires`.
       */
      triggersOn: z.array(z.string().min(1)).default([]),
    })
    .prefault({}),
  cms: z
    .object({
      /** Payload collection slugs (from ./payload `collections`) — `mod-<slug>-*`. */
      collections: z.array(z.string().min(1)).default([]),
      /** Payload global slugs (from ./payload `globals`) — `mod-<slug>-*`. */
      globals: z.array(z.string().min(1)).default([]),
      hasPlugins: z.boolean().default(false),
      hasMigrations: z.boolean().default(false),
      hasSeed: z.boolean().default(false),
      /** `./payload` exports `settings` (an admin settings screen). */
      hasSettings: z.boolean().default(false),
      /**
       * `./payload` exports `settings` as an adapter contribution
       * (`defineAdapterSettings`) merged as a TAB into the named target
       * module's settings global instead of owning its own. Mutually
       * exclusive with `hasSettings`. The target must be a `requires` dep.
       */
      settingsTabFor: z.string().min(1).optional(),
      /**
       * `./payload` exports `collectionTabs` (`defineAdapterCollectionTab`):
       * unnamed tabs merged into collections of the module named by
       * `settingsTabFor` (e.g. Stripe ids on billing's Plans). Unnamed tabs
       * keep their fields at the document root, so DB columns don't move.
       */
      hasCollectionTabs: z.boolean().default(false),
    })
    .prefault({}),
  /**
   * Provider adapter: this module plugs into another module's extension
   * point (e.g. `billing-adapter-stripe` → `billing`). The target calls OUT
   * to its adapters through `getModAdapters(target)` (server) and
   * `useModAdapters(target)` (client), which the generated registries fill —
   * the target never imports its adapters. `for` must be in `requires`.
   * Needs kit ≥ 2.6.
   */
  adapter: z
    .object({
      for: z.string().regex(SLUG_RE),
      /** `./server` exports `adapter` (the target's server contract). */
      server: z.boolean().default(false),
      /** Named export from `./web` implementing the target's web contract. */
      web: z.string().min(1).optional(),
      /** Named export from `./native` implementing the target's native contract. */
      native: z.string().min(1).optional(),
    })
    .optional(),
  /**
   * Runtime access gate. `check` names a `mod_<slug>_*` SQL function (no
   * args, returns boolean, callable by `authenticated`) that says whether the
   * CURRENT user may use the module. When false the module's menu entries are
   * hidden (web + native) and its web pages redirect to /a. Data access must
   * still be enforced by the module's own RLS — this gate is the UX layer.
   */
  access: z
    .object({
      check: z.string().min(1).optional(),
    })
    .prefault({}),
  admin: z
    .object({
      /**
       * `./admin` exports a client `AdminSettings` component, rendered on the
       * module's page in /admin (Modules → <module>). For settings that live
       * in the module's own tables rather than Payload fields.
       */
      settingsComponent: z.boolean().default(false),
    })
    .prefault({}),
  env: z
    .object({
      /** `./env` exports a `server` zod shape (vars named MOD_<SLUG>_*). */
      hasServer: z.boolean().default(false),
      /** `./env` exports a `client` zod shape (NEXT_PUBLIC_MOD_* / EXPO_PUBLIC_MOD_*). */
      hasClient: z.boolean().default(false),
    })
    .prefault({}),
});

export type ModuleManifestInput = z.input<typeof moduleManifestSchema>;
export type ModuleManifest = z.output<typeof moduleManifestSchema>;
export type ModNavEntry = ModuleManifest["nav"]["web"][number];
export type ModRouteEntry = ModuleManifest["routes"]["web"][number];

/**
 * Define a module manifest (the default export of
 * `modules/<slug>/module.config.ts`). Parses eagerly so a malformed
 * manifest fails at sync time with a precise zod error.
 */
export function defineModule(manifest: ModuleManifestInput): ModuleManifest {
  return moduleManifestSchema.parse(manifest);
}
