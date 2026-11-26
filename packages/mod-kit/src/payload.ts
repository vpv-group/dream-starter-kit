import type {
  Access,
  CollectionConfig,
  Field,
  FieldAccess,
  GlobalConfig,
  Payload,
} from "payload";

import { settingsGlobalSlug } from "./validate";

/**
 * Payload-side module helpers: admin settings screens (§1.7), seed steps,
 * and the kit's standard role-based access helpers (mirroring the host's
 * payload/access for the `roles: string[]` model on `users`) so module
 * collections don't reach into host code. This entry imports `payload` types
 * and is reachable only from the web/server side — never from clients.
 */

/**
 * The kit's generic array RowLabel (kit ≥ 2.6): shows a row's `label` /
 * `name` / `title`, its `key` and an "archived" pill instead of "Row 01".
 * Modules can't add import-map entries, so the host pins this one
 * (payload.config.ts → admin.dependencies). Use it as
 * `admin: { components: { RowLabel: ROW_LABEL_COMPONENT } }` on an array.
 */
export const ROW_LABEL_COMPONENT =
  "~/payload/components/LabelRowLabel#LabelRowLabel";

const STAFF_ROLES = ["admin", "editor"];

const roles = (req: { user?: unknown }): string[] =>
  (req.user as { roles?: string[] } | null | undefined)?.roles ?? [];

const userId = (req: { user?: unknown }): string | number | undefined =>
  (req.user as { id?: string | number } | null | undefined)?.id ?? undefined;

/** Anyone, authenticated or not. */
export const anyone: Access = () => true;

/** Full administrators only. */
export const isAdmin: Access = ({ req }) => roles(req).includes("admin");

/** Content staff: admin or editor. */
export const isStaff: Access = ({ req }) =>
  roles(req).some((r) => STAFF_ROLES.includes(r));

/**
 * Editorial content: staff see drafts + published; everyone else (incl.
 * anonymous) sees only published rows. Mirrors the host's `publishedOrStaff`
 * so content-bearing modules (e.g. mod-docs) can gate public read.
 */
export const publishedOrStaff: Access = ({ req }) => {
  if (roles(req).some((r) => STAFF_ROLES.includes(r))) return true;
  return { _status: { equals: "published" } };
};

/** Owner-scoped rows: staff see everything; users only rows whose owner is them. */
export const ownsOrStaff =
  (ownerField = "user"): Access =>
  ({ req }) => {
    if (roles(req).some((r) => STAFF_ROLES.includes(r))) return true;
    const id = userId(req);
    if (id !== undefined) return { [ownerField]: { equals: id } };
    return false;
  };

/** Field-level lock: only staff may read/update the field. */
export const staffFieldAccess: FieldAccess = ({ req }) =>
  roles(req).some((r) => STAFF_ROLES.includes(r));

/** Field-level lock: only admins may update. */
export const adminFieldAccess: FieldAccess = ({ req }) =>
  roles(req).includes("admin");

const staffRead: Access = isStaff;
const adminUpdate: Access = isAdmin;
const anyoneRead: Access = anyone;

export interface ModuleSettingsOptions {
  /** The module's slug — the global becomes `mod-<slug>-settings`. */
  slug: string;
  /** The module's display name — labels the screen "<name> Settings". */
  name: string;
  /** The author-controlled part: the configurable fields. */
  fields: Field[];
  /**
   * Expose the global read-only via /cms-api REST to anonymous clients
   * (for client-consumed config like feature toggles — NEVER secrets;
   * secrets belong in the zod env schema, golden rule #3).
   */
  publicRead?: boolean;
  /**
   * Admin nav group for the settings screen. Defaults to "Modules"; a
   * feature with several admin entries (e.g. AI Chat: settings + skills +
   * adapter tabs) can cluster them under its own group.
   */
  group?: string;
}

export interface ModuleSettings {
  /** The owning module's slug. */
  slug: string;
  /**
   * Where the values live: a group of this name on the module's
   * `kit-modules` row (its page in /admin) — see `settingsGroupName`.
   */
  groupName: string;
  /** The module's legacy settings global (kept hidden one release, for migration). */
  globalSlug: string;
  /** Whether clients may read this global anonymously over REST. */
  publicRead: boolean;
  /** Field defaults, applied by `getModuleSettings` before first save. */
  defaults: Record<string, unknown>;
  /**
   * The fields + hooks, wrapped as a Payload Global. Since kit 2.2 the fields
   * render on the module's `kit-modules` page and the global is registered
   * HIDDEN only so existing values can be copied over once (reconcile).
   * Hooks set on it (e.g. `afterChange`) run when the module page is saved.
   */
  global: GlobalConfig;
}

/**
 * `chat` → `mod_chat`: the group holding a module's settings on its
 * kit-modules row. Kept short — nested field/table names build on it and
 * Postgres truncates identifiers past 63 characters.
 */
export function settingsGroupName(slug: string): string {
  return `mod_${slug.replace(/-/g, "_")}`;
}

/** Collect `defaultValue`s from top-level named fields (incl. inside rows/groups). */
function collectDefaults(fields: Field[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    // `tabs` fields nest their fields under tabs[].fields; unnamed tabs hoist
    // those to the document root, so their defaults belong at the top level.
    if ("type" in field && field.type === "tabs" && Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
        if (Array.isArray(tab.fields) && !("name" in tab)) {
          Object.assign(defaults, collectDefaults(tab.fields));
        }
      }
      continue;
    }
    if (
      "fields" in field &&
      Array.isArray(field.fields) &&
      !("name" in field)
    ) {
      Object.assign(defaults, collectDefaults(field.fields));
      continue;
    }
    if (
      "name" in field &&
      typeof field.name === "string" &&
      "defaultValue" in field &&
      typeof field.defaultValue !== "function" &&
      field.defaultValue !== undefined
    ) {
      defaults[field.name] = field.defaultValue;
    }
  }
  return defaults;
}

/**
 * Wrap author-defined fields in a framework-invariant Payload Global: slug
 * `mod-<slug>-settings`, Modules admin group, versioned, staff-read /
 * admin-update by default (or public read when opted in). The module's
 * `./payload` entry exports the result as `settings`; sync registers
 * `settings.global` like any other global.
 */
export function defineModuleSettings(
  opts: ModuleSettingsOptions,
): ModuleSettings {
  const globalSlug = settingsGlobalSlug(opts.slug);
  return {
    slug: opts.slug,
    groupName: settingsGroupName(opts.slug),
    globalSlug,
    publicRead: opts.publicRead ?? false,
    defaults: collectDefaults(opts.fields),
    global: {
      slug: globalSlug,
      label: `${opts.name} Settings`,
      // Legacy: the screen moved to the module's page (Modules → <module>);
      // /admin/globals/mod-<slug>-settings redirects there (proxy.ts).
      admin: { group: opts.group ?? "Modules", hidden: true },
      access: {
        read: opts.publicRead ? anyoneRead : staffRead,
        update: adminUpdate,
        readVersions: staffRead,
      },
      // Keep the last 20 saves (Payload's default keeps every one forever).
      versions: { max: 20 },
      fields: opts.fields,
    },
  };
}

/**
 * The settings group stored on a module's `kit-modules` row, or null when the
 * row doesn't exist yet (fresh deploy before the boot reconcile).
 */
async function readSettingsGroup(
  payload: Payload,
  slug: string,
  groupName: string,
  req?: unknown,
): Promise<Record<string, unknown> | null> {
  const find = payload.find.bind(payload) as (args: {
    collection: string;
    where: Record<string, unknown>;
    limit: number;
    depth: number;
    overrideAccess: boolean;
    req?: unknown;
  }) => Promise<{ docs: Record<string, unknown>[] }>;
  const { docs } = await find({
    collection: "kit-modules",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    // Inside a hook, pass the operation's req: a req-less read runs outside
    // its transaction and takes a second pool connection (can deadlock saves).
    ...(req ? { req } : {}),
  });
  const group = docs[0]?.[groupName];
  return group && typeof group === "object"
    ? (group as Record<string, unknown>)
    : null;
}

function mergeDefaults(
  defaults: Record<string, unknown>,
  values: Record<string, unknown> | null,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value !== null && value !== undefined) merged[key] = value;
  }
  return merged;
}

/**
 * Read a module's settings server-side (Local API) from its page in /admin
 * (the `kit-modules` row), with field defaults applied — so a module works
 * before the admin ever opens the screen, and degrades to defaults if the
 * CMS is unreachable. From inside a Payload hook, pass `{ req }`.
 */
export async function getModuleSettings<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  payload: Payload,
  settings: ModuleSettings,
  opts: { req?: unknown } = {},
): Promise<T> {
  try {
    const group = await readSettingsGroup(
      payload,
      settings.slug,
      settings.groupName,
      opts.req,
    );
    return mergeDefaults(settings.defaults, group) as T;
  } catch {
    return settings.defaults as T;
  }
}

/**
 * Write (merge) a module's settings — for seeds and hooks that change
 * settings programmatically. Pass `req` from inside a hook (same transaction).
 * Runs as a system write (overrideAccess); never call it with user input.
 */
export async function updateModuleSettings(
  payload: Payload,
  settings: Pick<ModuleSettings, "slug" | "groupName">,
  data: Record<string, unknown>,
  opts: { req?: unknown; context?: Record<string, unknown> } = {},
): Promise<void> {
  const find = payload.find.bind(payload) as (args: {
    collection: string;
    where: Record<string, unknown>;
    limit: number;
    depth: number;
    overrideAccess: boolean;
    req?: unknown;
  }) => Promise<{ docs: { id: string | number }[] }>;
  const update = payload.update.bind(payload) as (args: {
    collection: string;
    id: string | number;
    data: Record<string, unknown>;
    overrideAccess: boolean;
    req?: unknown;
    context?: Record<string, unknown>;
  }) => Promise<unknown>;
  const { docs } = await find({
    collection: "kit-modules",
    where: { slug: { equals: settings.slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    ...(opts.req ? { req: opts.req } : {}),
  });
  const row = docs[0];
  if (!row) throw new Error(`kit-modules row for "${settings.slug}" not found`);
  await update({
    collection: "kit-modules",
    id: row.id,
    data: { [settings.groupName]: data },
    overrideAccess: true,
    ...(opts.req ? { req: opts.req } : {}),
    ...(opts.context ? { context: opts.context } : {}),
  });
}

/* -------------------------------------------------------------------------- */
/* Settings-tab contributions — adapters that plug into a host feature's       */
/* settings screen instead of owning a separate one (e.g. chat channel         */
/* adapters → the one "AI Chat Settings" global).                              */
/* -------------------------------------------------------------------------- */

/** A tab injected into a target settings global (structurally a Payload Tab). */
interface SettingsTab {
  label: string;
  description?: string;
  fields: Field[];
}

export interface AdapterSettingsOptions {
  /** The contributing module's slug, e.g. "chat-adapter-slack". */
  slug: string;
  /** Tab label, e.g. "Slack". */
  name: string;
  /** The host module slug whose settings global hosts this tab, e.g. "chat". */
  target: string;
  /**
   * Short storage key: the fields live under `adapter_<key>` instead of
   * `adapter_<slug_snake>`. Use it when the slug is long — Payload builds
   * column/enum names from target + group + field, and Postgres cuts
   * identifiers at 63 characters. Never change it once shipped.
   */
  key?: string;
  /** Optional tab blurb. */
  description?: string;
  /** The author-controlled fields (stored under a per-adapter group). */
  fields: Field[];
  /**
   * Let anonymous clients read this tab when the target's settings are
   * `publicRead`. Default false: adapter tabs (API config, connector state)
   * stay staff-only even inside a public settings group.
   */
  publicRead?: boolean;
}

export interface AdapterSettings {
  slug: string;
  /** Host module slug whose `mod-<target>-settings` global owns the tab. */
  target: string;
  /** Group key namespacing this adapter's fields inside the target global. */
  groupName: string;
  /** Field defaults (un-nested), applied by `getAdapterSettings`. */
  defaults: Record<string, unknown>;
  /** The tab merged into the target settings global by `composeSettingsTabs`. */
  tab: SettingsTab;
}

/** `chat-adapter-slack` → `adapter_chat_adapter_slack` (a valid field/group name). */
export function adapterGroupName(slug: string): string {
  return `adapter_${slug.replace(/-/g, "_")}`;
}

/**
 * Define an adapter's settings as a TAB contributed to another module's
 * settings global, rather than a standalone global. The fields live under a
 * per-adapter `group` so multiple adapters never collide, and the host's
 * generated payload registry merges the tab in via `composeSettingsTabs`. The
 * adapter reads its values back with `getAdapterSettings`. Keeps adapters
 * modular (own module, own webhook) while presenting one unified screen.
 */
export function defineAdapterSettings(
  opts: AdapterSettingsOptions,
): AdapterSettings {
  const groupName = opts.key
    ? `adapter_${opts.key.replace(/-/g, "_")}`
    : adapterGroupName(opts.slug);
  return {
    slug: opts.slug,
    target: opts.target,
    groupName,
    defaults: collectDefaults(opts.fields),
    tab: {
      label: opts.name,
      ...(opts.description ? { description: opts.description } : {}),
      // One group wraps the adapter's fields so the target global stores them
      // under `groupName` — no field-name collisions across adapters.
      fields: [
        {
          name: groupName,
          type: "group",
          label: opts.name,
          // Field-level access applies inside the target's group, so a
          // public target (e.g. billing's pricing page) never leaks this tab.
          ...(opts.publicRead ? {} : { access: { read: staffFieldAccess } }),
          fields: opts.fields,
        },
      ],
    },
  };
}

/**
 * Merge adapter tabs into a host feature's settings global. Called by the
 * generated payload registry (`pnpm mod sync`) so the host composes — the
 * feature module never imports its sibling adapters. The base settings'
 * first `tabs` field gains one tab per adapter, and the document defaults gain
 * each adapter's namespaced group.
 */
export function composeSettingsTabs(
  base: ModuleSettings,
  adapters: AdapterSettings[],
): ModuleSettings {
  if (adapters.length === 0) return base;
  const at = base.global.fields.findIndex(
    (f) => "type" in f && f.type === "tabs" && Array.isArray(f.tabs),
  );
  if (at === -1) {
    // Silently dropping the tabs would hide adapter config from admins.
    throw new Error(
      `[${base.slug}] settings have no top-level "tabs" field, so adapter tabs (${adapters.map((a) => a.slug).join(", ")}) can't be added — wrap the module's settings fields in tabs`,
    );
  }
  const fields = base.global.fields.map((field, i) =>
    i === at && field.type === "tabs"
      ? { ...field, tabs: [...field.tabs, ...adapters.map((a) => a.tab)] }
      : field,
  );
  const defaults = { ...base.defaults };
  for (const a of adapters) defaults[a.groupName] = a.defaults;
  return {
    ...base,
    defaults,
    global: { ...base.global, fields },
  };
}

/**
 * Read an adapter's settings server-side, from its tab inside the target
 * module's settings (on the target's kit-modules row), with defaults applied. Mirrors
 * `getModuleSettings` but reads the namespaced group.
 */
export async function getAdapterSettings<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  payload: Payload,
  adapter: AdapterSettings,
  opts: { req?: unknown } = {},
): Promise<T> {
  try {
    const group = await readSettingsGroup(
      payload,
      adapter.target,
      settingsGroupName(adapter.target),
      opts.req,
    );
    const own = (group?.[adapter.groupName] ?? null) as Record<
      string,
      unknown
    > | null;
    return mergeDefaults(adapter.defaults, own) as T;
  } catch {
    return adapter.defaults as T;
  }
}

/* -------------------------------------------------------------------------- */
/* Collection tabs — adapter fields merged into a target module's collection   */
/* (e.g. the Stripe adapter's product/price ids on billing's Plans).           */
/* -------------------------------------------------------------------------- */

export interface AdapterCollectionTabOptions {
  /** The contributing module's slug. */
  slug: string;
  /** Target module slug (the adapter's `cms.settingsTabFor`). */
  target: string;
  /** The target collection slug, e.g. "mod-billing-plans". */
  collection: string;
  /** Tab label, e.g. "Stripe". */
  label: string;
  description?: string;
  fields: Field[];
}

export type AdapterCollectionTab = AdapterCollectionTabOptions;

/**
 * Define an UNNAMED tab an adapter adds to a target module's collection.
 * Unnamed tabs keep their fields at the document root, so adding or removing
 * the adapter never moves columns. The target collection must have a
 * top-level `tabs` field; the generated payload registry merges the tab in
 * via `composeCollectionTabs`.
 */
export function defineAdapterCollectionTab(
  opts: AdapterCollectionTabOptions,
): AdapterCollectionTab {
  return { ...opts };
}

/**
 * Append adapter tabs to the matching collections' first top-level `tabs`
 * field. Throws when a tab targets a collection that has none (or isn't
 * installed), so a misconfigured adapter fails `pnpm mod sync`/boot loudly.
 */
export function composeCollectionTabs(
  collections: CollectionConfig[],
  tabs: AdapterCollectionTab[],
): CollectionConfig[] {
  if (tabs.length === 0) return collections;
  const used = new Set<AdapterCollectionTab>();
  const out = collections.map((collection) => {
    const mine = tabs.filter((t) => t.collection === collection.slug);
    if (mine.length === 0) return collection;
    const at = collection.fields.findIndex(
      (f) => "type" in f && f.type === "tabs" && Array.isArray(f.tabs),
    );
    if (at === -1) {
      throw new Error(
        `[${mine.map((t) => t.slug).join(", ")}] collection "${collection.slug}" has no top-level "tabs" field to add the adapter tab to`,
      );
    }
    const fields = collection.fields.map((field, i) =>
      i === at && field.type === "tabs"
        ? {
            ...field,
            tabs: [
              ...field.tabs,
              ...mine.map((t) => ({
                label: t.label,
                ...(t.description ? { description: t.description } : {}),
                fields: t.fields,
              })),
            ],
          }
        : field,
    );
    mine.forEach((t) => used.add(t));
    return { ...collection, fields };
  });
  const orphan = tabs.find((t) => !used.has(t));
  if (orphan) {
    throw new Error(
      `[${orphan.slug}] collection tab targets "${orphan.collection}", which isn't installed`,
    );
  }
  return out;
}

/**
 * One step of a module's CMS seed — appended after the core steps and run
 * through the existing idempotent `/api/cms/seed` + `/cms-setup` flow. Steps
 * must be idempotent and scalar-only (no binary fixtures).
 */
export interface ModSeedStep {
  label: string;
  run: (payload: Payload) => Promise<void>;
}
