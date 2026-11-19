import type { ModuleManifest } from "./manifest";

/**
 * Pure validation logic for module manifests — namespacing, mount
 * collisions, SQL ownership lint (docs/MODULES-PLAN.md §1.1). Consumed by
 * `pnpm mod sync` (tooling/mod) and unit-tested here. Every function returns
 * human-readable error strings instead of throwing so the CLI can aggregate.
 */

/** `chat-plus` → `chat_plus` (table-name form of a slug). */
export function slugToSnake(slug: string): string {
  return slug.replace(/-/g, "_");
}

/** The required prefix for a module's public-schema tables. */
export function tablePrefix(slug: string): string {
  return `mod_${slugToSnake(slug)}`;
}

/** The required prefix for a module's Payload collection/global slugs. */
export function cmsPrefix(slug: string): string {
  return `mod-${slug}`;
}

/** The implicit settings-global slug for a module (§1.7). */
export function settingsGlobalSlug(slug: string): string {
  return `mod-${slug}-settings`;
}

/** The required env-var prefix family for a module. */
export function envPrefixes(slug: string): string[] {
  const upper = slugToSnake(slug).toUpperCase();
  return [
    `MOD_${upper}_`,
    `NEXT_PUBLIC_MOD_${upper}_`,
    `EXPO_PUBLIC_MOD_${upper}_`,
  ];
}

/**
 * Core route prefixes a `mount` override may never claim — all host-owned.
 * The module default-mount namespace is /a/<slug>: overrides may not claim
 * inside it (checked separately), but the bare "/a" mount itself IS claimable
 * (the dashboard claims it as the app home).
 */
export const RESERVED_MOUNTS = [
  "/admin",
  "/cms-api",
  "/api",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/confirm-email",
  "/check-email",
  "/welcome",
  "/cms-setup",
  "/profile",
  "/checkout",
  "/onboarding",
  "/workspace",
  "/invite",
  "/join",
] as const;

/** Native mounts are screen names, not paths; only the home screen is claimable. */
export const NATIVE_MOUNTS = ["index"] as const;

/**
 * Core `public` tables modules may declare DML access to (`database.dml`).
 * Kept deliberately tiny — e.g. billing's webhook auto-tags users by plan.
 */
export const CORE_DML_WHITELIST = ["tags", "user_tags"] as const;

function startsWithPrefix(name: string, prefix: string): boolean {
  return name === prefix || name.startsWith(`${prefix}_`);
}

/** Per-manifest semantic checks (beyond the zod shape). */
export function validateManifest(m: ModuleManifest): string[] {
  const errors: string[] = [];
  const prefix = tablePrefix(m.slug);
  const cms = cmsPrefix(m.slug);

  for (const table of m.database.tables) {
    if (!startsWithPrefix(table, prefix)) {
      errors.push(
        `[${m.slug}] table "${table}" must be "${prefix}" or "${prefix}_*"`,
      );
    }
  }
  for (const slug of [...m.cms.collections, ...m.cms.globals]) {
    if (slug !== cms && !slug.startsWith(`${cms}-`)) {
      errors.push(
        `[${m.slug}] cms slug "${slug}" must be "${cms}" or "${cms}-*"`,
      );
    }
  }
  if (m.cms.globals.includes(settingsGlobalSlug(m.slug)) && m.cms.hasSettings) {
    errors.push(
      `[${m.slug}] "${settingsGlobalSlug(m.slug)}" is implicit via cms.hasSettings — don't also list it in cms.globals`,
    );
  }
  if (m.cms.settingsTabFor) {
    if (m.cms.hasSettings) {
      errors.push(
        `[${m.slug}] cms.settingsTabFor and cms.hasSettings are mutually exclusive — an adapter contributes a tab OR owns a settings global, not both`,
      );
    }
    if (!m.requires.includes(m.cms.settingsTabFor)) {
      errors.push(
        `[${m.slug}] cms.settingsTabFor "${m.cms.settingsTabFor}" must be listed in requires (the target's settings global hosts the tab)`,
      );
    }
  }
  for (const fn of m.server.edgeFunctions) {
    if (!fn.startsWith(`${m.slug}-`)) {
      errors.push(
        `[${m.slug}] edge function "${fn}" must be prefixed "${m.slug}-"`,
      );
    }
  }
  for (const t of m.database.triggersOn) {
    if (
      !CORE_TRIGGER_TABLES.includes(
        t as (typeof CORE_TRIGGER_TABLES)[number],
      ) &&
      !t.startsWith("mod_")
    ) {
      errors.push(
        `[${m.slug}] database.triggersOn "${t}" must be a core hook-point table (${CORE_TRIGGER_TABLES.join(", ")}) or a table of a required module`,
      );
    }
  }
  if (m.requires.includes(m.slug)) {
    errors.push(`[${m.slug}] cannot require itself`);
  }

  // Platform consistency: declaring native surface requires the native platform.
  if (!m.platforms.native) {
    if (m.nav.native.length > 0 || m.routes.native.length > 0)
      errors.push(
        `[${m.slug}] declares native nav/routes but platforms.native is false`,
      );
    if (m.widgets.native)
      errors.push(
        `[${m.slug}] declares a native widget but platforms.native is false`,
      );
  }
  if (!m.platforms.web) {
    if (m.nav.web.length > 0 || m.routes.web.length > 0)
      errors.push(
        `[${m.slug}] declares web nav/routes but platforms.web is false`,
      );
    if (m.widgets.web)
      errors.push(
        `[${m.slug}] declares a web widget but platforms.web is false`,
      );
  }

  // Mount overrides: web mounts are absolute paths outside the reserved list;
  // native mounts come from the short NATIVE_MOUNTS list.
  for (const r of m.routes.web) {
    if (r.mount === undefined) continue;
    if (!r.mount.startsWith("/")) {
      errors.push(`[${m.slug}] web mount "${r.mount}" must start with "/"`);
      continue;
    }
    const claimed = RESERVED_MOUNTS.find(
      (res) => r.mount === res || r.mount?.startsWith(`${res}/`),
    );
    if (claimed) {
      errors.push(
        `[${m.slug}] web mount "${r.mount}" collides with reserved core route "${claimed}"`,
      );
    }
    // "/a" exactly is claimable (the dashboard home), but "/a/<seg>" is the
    // default-mount namespace (/a/<slug>) — overrides inside it would collide
    // with generated mounts.
    if (r.mount.startsWith("/a/")) {
      errors.push(
        `[${m.slug}] web mount "${r.mount}" is inside the module default-mount namespace /a/<slug> — drop the mount override or claim a path outside /a/`,
      );
    }
  }
  for (const r of m.routes.native) {
    if (r.mount === undefined) continue;
    if (!NATIVE_MOUNTS.includes(r.mount as (typeof NATIVE_MOUNTS)[number])) {
      errors.push(
        `[${m.slug}] native mount "${r.mount}" — only ${NATIVE_MOUNTS.join(", ")} can be claimed`,
      );
    }
  }

  return errors;
}

/** Cross-module collision + dependency checks for the installed set. */
export function validateManifestSet(manifests: ModuleManifest[]): string[] {
  const errors: string[] = [];
  const slugs = new Set<string>();

  const claim = (
    kind: string,
    key: string,
    owner: string,
    seen: Map<string, string>,
  ) => {
    const prior = seen.get(key);
    if (prior && prior !== owner) {
      errors.push(`${kind} "${key}" claimed by both "${prior}" and "${owner}"`);
    } else {
      seen.set(key, owner);
    }
  };

  const tables = new Map<string, string>();
  const cmsSlugs = new Map<string, string>();
  const webMounts = new Map<string, string>();
  const nativeMounts = new Map<string, string>();
  const edgeFns = new Map<string, string>();

  for (const m of manifests) {
    if (slugs.has(m.slug)) {
      errors.push(`duplicate module slug "${m.slug}"`);
      continue;
    }
    slugs.add(m.slug);

    for (const t of m.database.tables) claim("table", t, m.slug, tables);
    for (const c of [
      ...m.cms.collections,
      ...m.cms.globals,
      ...(m.cms.hasSettings ? [settingsGlobalSlug(m.slug)] : []),
    ])
      claim("cms slug", c, m.slug, cmsSlugs);
    for (const r of m.routes.web)
      if (r.mount) claim("web mount", r.mount, m.slug, webMounts);
    for (const r of m.routes.native)
      if (r.mount) claim("native mount", r.mount, m.slug, nativeMounts);
    for (const fn of m.server.edgeFunctions)
      claim("edge function", fn, m.slug, edgeFns);
  }

  for (const m of manifests) {
    for (const dep of m.requires) {
      if (!slugs.has(dep)) {
        errors.push(
          `[${m.slug}] requires "${dep}", which is not installed — install it first`,
        );
      }
    }

    // database.dml entries must be reachable: a table of a required module
    // or a core-whitelisted table — never an arbitrary table.
    const reachable = new Set<string>(CORE_DML_WHITELIST);
    for (const dep of manifests.filter((x) => m.requires.includes(x.slug))) {
      for (const t of dep.database.tables) reachable.add(t);
    }
    for (const t of m.database.triggersOn) {
      if (t.startsWith("mod_") && !reachable.has(t)) {
        errors.push(
          `[${m.slug}] database.triggersOn table "${t}" is not a table of a required module`,
        );
      }
    }
    for (const t of m.database.dml) {
      if (!reachable.has(t)) {
        errors.push(
          `[${m.slug}] database.dml table "${t}" is neither a table of a required module nor core-whitelisted (${CORE_DML_WHITELIST.join(", ")})`,
        );
      }
    }
  }

  return errors;
}

/** Tables in `public` owned by the host — module SQL may never DDL these. */
const SQL_FORBIDDEN_PATTERNS: [RegExp, string][] = [
  [
    /\bauth\.(?!uid\s*\(|jwt\s*\(|role\s*\()/i,
    "references the auth schema (only auth.uid()/auth.jwt()/auth.role() are allowed)",
  ],
  [/\bstorage\./i, "references the storage schema"],
  [/\b(create|alter|drop)\s+(role|user)\b/i, "contains role DDL"],
  [/\bgrant\b/i, "contains GRANT statements"],
  [/\brevoke\b/i, "contains REVOKE statements"],
];

const DDL_TABLE_RE =
  /\b(?:create\s+table(?:\s+if\s+not\s+exists)?|alter\s+table(?:\s+if\s+exists)?(?:\s+only)?|drop\s+table(?:\s+if\s+exists)?)\s+(?:public\.)?"?([a-z0-9_]+)"?/gi;

/**
 * DML target matchers. `update` only counts as DML when followed by a table
 * and `set` — otherwise "for update to", "before update on", "insert or
 * update of", "on update cascade" and "do update set" would all be read as
 * DML on a table named "to"/"on"/"cascade".
 */
const DML_TABLE_RES: RegExp[] = [
  /\binsert\s+into\s+(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
  /\bdelete\s+from\s+(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
  /\bupdate\s+(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?(?:\s+(?:as\s+)?(?!set\b)[a-z_][a-z0-9_]*)?\s+set\b/gi,
];

/**
 * `create [or replace] [constraint] trigger <name> … on <table>`. Captures
 * the trigger name and the table it attaches to.
 */
const TRIGGER_RE =
  /\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+"?([a-z0-9_]+)"?[\s\S]*?\bon\s+(?:public\.)?"?([a-z0-9_]+)"?/gi;

/**
 * Core `public` tables a module may attach triggers to, when it declares
 * them in `database.triggersOn` (e.g. a CRM mirroring sign-ups). Tables of
 * modules listed in `requires` are also allowed.
 */
export const CORE_TRIGGER_TABLES = [
  "organizations",
  "memberships",
  "invitations",
  "profiles",
  "auth_events",
] as const;

/**
 * Modules used to be called "extensions", and their tables were
 * prefixed `ext_`. Shipped migrations are append-only, so older files still
 * create `ext_<slug>_*` tables that a later migration renames to
 * `mod_<slug>_*`. The lint treats a legacy `ext_` name as the module's own
 * `mod_` table.
 */
export function legacyTableName(table: string): string {
  return table.startsWith("ext_") ? `mod_${table.slice(4)}` : table;
}

/**
 * Best-effort SQL ownership lint (§1.1): a module's migrations may only
 * CREATE/ALTER/DROP its own declared tables, may DML its own tables plus the
 * whitelisted tables of modules it `requires`, and may never touch
 * `auth.*` / `storage.*` / role + grant DDL. Regex-based — flags loudly, no
 * SQL parser claimed.
 */
export function lintModuleSql(
  sql: string,
  opts: {
    slug: string;
    file: string;
    ownTables: string[];
    /** Extra tables DML is allowed on (from `requires` + declared core access). */
    allowedDmlTables?: string[];
    /** Foreign tables triggers may attach to (from `database.triggersOn`). */
    triggerTables?: string[];
  },
): string[] {
  const errors: string[] = [];
  const where = `[${opts.slug}] ${opts.file}`;
  // Strip line comments so commented-out SQL doesn't trip the lint.
  const cleaned = sql.replace(/--[^\n]*/g, "");

  for (const [re, message] of SQL_FORBIDDEN_PATTERNS) {
    if (re.test(cleaned)) errors.push(`${where}: ${message}`);
  }

  const own = new Set(opts.ownTables);
  const dmlAllowed = new Set([
    ...opts.ownTables,
    ...(opts.allowedDmlTables ?? []),
  ]);

  for (const match of cleaned.matchAll(DDL_TABLE_RE)) {
    const table = match[1] && legacyTableName(match[1]);
    if (table && !own.has(table)) {
      errors.push(
        `${where}: DDL on table "${table}" which is not declared in database.tables`,
      );
    }
  }
  for (const re of DML_TABLE_RES) {
    for (const match of cleaned.matchAll(re)) {
      const table = match[1] && legacyTableName(match[1]);
      if (table && !dmlAllowed.has(table)) {
        errors.push(
          `${where}: DML on table "${table}" which is neither owned nor whitelisted via requires`,
        );
      }
    }
  }

  // Triggers: on the module's own tables, or on declared hook-point tables
  // (database.triggersOn). Triggers on foreign tables must be named
  // mod_<slug>_* so drop.sql and humans can find them.
  const triggerTables = new Set(opts.triggerTables ?? []);
  const triggerPrefix = tablePrefix(opts.slug);
  for (const match of cleaned.matchAll(TRIGGER_RE)) {
    const name = match[1] ?? "";
    const table = match[2] && legacyTableName(match[2]);
    if (!table || own.has(table)) continue;
    if (!triggerTables.has(table)) {
      errors.push(
        `${where}: trigger "${name}" on table "${table}" which is neither owned nor declared in database.triggersOn`,
      );
    } else if (!startsWithPrefix(name, triggerPrefix)) {
      errors.push(
        `${where}: trigger "${name}" on "${table}" must be named "${triggerPrefix}_*"`,
      );
    }
  }

  return errors;
}
