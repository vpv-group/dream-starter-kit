import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  findContractStatements,
  isMarkedContract,
  lintMigrationSafety,
  lintPayloadMigrationSafety,
  payloadUpSection,
} from "./migration-safety";
import { findRepoRoot } from "./paths";

describe("findContractStatements", () => {
  it.each([
    ["drop table public.x;", "drops a table"],
    ["alter table public.x drop column y;", "drops a column"],
    ["alter table public.x rename column a to b;", "renames a column"],
    ["alter table public.x rename to y;", "renames a table"],
    ["alter table x alter column y type bigint;", "changes a column's type"],
    ["alter table x alter column y set not null;", "makes a column NOT NULL"],
    ["truncate public.x;", "truncates a table"],
    ["drop schema s cascade;", "drops a schema"],
  ])("flags %s", (sql, message) => {
    expect(findContractStatements(sql).map((f) => f.message)).toEqual([
      message,
    ]);
  });

  it("allows expand-only changes", () => {
    const sql = `
      create table public.mod_x (id uuid primary key);
      alter table public.mod_x add column note text;
      alter table public.mod_x alter column note set default '';
      alter table public.mod_x alter column note drop not null;
      drop policy if exists "p" on public.mod_x;
      create policy "p" on public.mod_x for select using (true);
      drop function if exists public.f();
      create index on public.mod_x (note);
    `;
    expect(findContractStatements(sql)).toEqual([]);
  });

  it("ignores comments and string literals", () => {
    const sql = `
      -- drop table public.old;
      /* alter table x rename to y; */
      insert into public.log (msg) values ('drop table public.x');
    `;
    expect(findContractStatements(sql)).toEqual([]);
  });

  it("still sees DDL inside a DO block", () => {
    const sql = `do $$ begin execute 'x'; drop table public.old; end $$;`;
    expect(findContractStatements(sql).map((f) => f.message)).toEqual([
      "drops a table",
    ]);
  });
});

describe("lintMigrationSafety", () => {
  it("passes a contract step that carries the marker", () => {
    const sql =
      "-- dream:contract old column unused since 2.4\nalter table x drop column y;";
    expect(isMarkedContract(sql)).toBe(true);
    expect(lintMigrationSafety("f.sql", sql)).toEqual([]);
  });

  it("explains how to fix an unmarked contract step", () => {
    const [error] = lintMigrationSafety("f.sql", "drop table public.x;");
    expect(error).toMatch(/^f\.sql: drops a table/);
    expect(error).toMatch(/dream:contract/);
  });
});

/**
 * Shipped before the expand/contract rule. Shipped migrations are never
 * edited, so these stay grandfathered; everything newer must pass the lint.
 */
const GRANDFATHERED = new Set([
  "supabase/migrations/20260612100002_drop_ext_demo.sql",
  "supabase/migrations/20260613033328_ext_chat_005_unified_channel_threads.sql",
  "supabase/migrations/20261117192627_mod_billing_002_rename_to_mod_prefix.sql",
  "supabase/migrations/20261117192628_mod_chat_006_rename_to_mod_prefix.sql",
  "supabase/migrations/20261117192629_mod_notifications_002_rename_to_mod_prefix.sql",
  "supabase/migrations/20261117192630_mod_reminders_002_rename_to_mod_prefix.sql",
  "modules/billing/supabase/migrations/002_rename_to_mod_prefix.sql",
  "modules/chat/supabase/migrations/005_unified_channel_threads.sql",
  "modules/chat/supabase/migrations/006_rename_to_mod_prefix.sql",
  "modules/notifications/supabase/migrations/002_rename_to_mod_prefix.sql",
  "modules/reminders/supabase/migrations/002_rename_to_mod_prefix.sql",
]);

describe("Payload migrations", () => {
  const migration = `
    import { type MigrateUpArgs, sql } from "@payloadcms/db-postgres";
    export async function up({ db }: MigrateUpArgs): Promise<void> {
      await db.execute(sql\`ALTER TABLE "cms"."posts" ADD COLUMN "x" varchar;\`);
    }
    export async function down({ db }: MigrateDownArgs): Promise<void> {
      await db.execute(sql\`ALTER TABLE "cms"."posts" DROP COLUMN "x";\`);
    }`;

  it("reads only up(): down() always drops what up() added", () => {
    expect(payloadUpSection(migration)).not.toMatch(/DROP COLUMN/);
    expect(lintPayloadMigrationSafety("m.ts", migration)).toEqual([]);
  });

  it("flags a contract step in up()", () => {
    const contract = migration.replace(
      'ADD COLUMN "x" varchar',
      'DROP COLUMN "y"',
    );
    expect(lintPayloadMigrationSafety("m.ts", contract)[0]).toMatch(
      /^m\.ts: drops a column/,
    );
  });
});

/**
 * An app's own migrations shipped before it took the expand/contract rule
 * (e.g. a clone that dropped a table of its own before syncing the kit) are
 * listed in `supabase/migration-safety.allow.json`, a JSON array of
 * repo-relative paths. The kit ships no such file, so kit updates never
 * conflict with it.
 */
function appAllowList(root: string): string[] {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(
        path.join(root, "supabase/migration-safety.allow.json"),
        "utf8",
      ),
    );
    return Array.isArray(parsed)
      ? parsed.filter((f): f is string => typeof f === "string")
      : [];
  } catch {
    return [];
  }
}

describe("repository migrations follow expand/contract", () => {
  const root = findRepoRoot();
  const dirs = [
    "supabase/migrations",
    ...readdirSync(path.join(root, "modules"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `modules/${d.name}/supabase/migrations`),
  ];
  const files = dirs.flatMap((dir) => {
    try {
      return readdirSync(path.join(root, dir))
        .filter((f) => f.endsWith(".sql"))
        .map((f) => `${dir}/${f}`);
    } catch {
      return [];
    }
  });
  const payloadDirs = [
    "apps/nextjs/src/payload/migrations",
    ...readdirSync(path.join(root, "modules"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `modules/${d.name}/src/payload/migrations`),
  ];
  const payloadFiles = payloadDirs.flatMap((dir) => {
    try {
      return readdirSync(path.join(root, dir))
        .filter((f) => f.endsWith(".ts") && f !== "index.ts")
        .map((f) => `${dir}/${f}`);
    } catch {
      return [];
    }
  });
  const allowed = new Set([...GRANDFATHERED, ...appAllowList(root)]);
  // Payload migrations are named <YYYYMMDD_HHMMSS>_<name>.ts. The rule
  // covers them from kit 2.5 on; older ones (kit and app) are grandfathered.
  const PAYLOAD_RULE_SINCE = "20261125";
  const payloadChecked = payloadFiles.filter(
    (f) => path.basename(f).slice(0, 8) >= PAYLOAD_RULE_SINCE,
  );

  it("finds the migrations", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("has no unmarked contract step outside the grandfathered list", () => {
    const errors = [
      ...files
        .filter((f) => !allowed.has(f))
        .flatMap((f) =>
          lintMigrationSafety(f, readFileSync(path.join(root, f), "utf8")),
        ),
      ...payloadChecked
        .filter((f) => !allowed.has(f))
        .flatMap((f) =>
          lintPayloadMigrationSafety(
            f,
            readFileSync(path.join(root, f), "utf8"),
          ),
        ),
    ];
    expect(errors).toEqual([]);
  });

  it("keeps the grandfathered list honest (every entry still exists)", () => {
    const all = [...files, ...payloadFiles];
    expect([...allowed].filter((f) => !all.includes(f))).toEqual([]);
  });
});
