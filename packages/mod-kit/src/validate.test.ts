import { describe, expect, it } from "vitest";

import { defineModule } from "./manifest";
import {
  lintModuleSql,
  slugToSnake,
  tablePrefix,
  validateManifest,
  validateManifestSet,
} from "./validate";

const base = {
  name: "Demo",
  version: "1.0.0",
  kitCompat: ">=2.0.0 <3",
};

describe("naming helpers", () => {
  it("converts slugs to table prefixes", () => {
    expect(slugToSnake("chat-plus")).toBe("chat_plus");
    expect(tablePrefix("chat-plus")).toBe("mod_chat_plus");
  });
});

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    const m = defineModule({
      ...base,
      slug: "chat",
      requires: ["notifications"],
      database: { tables: ["mod_chat_threads", "mod_chat_messages"] },
      server: { routes: true, edgeFunctions: ["chat-digest"] },
      cms: { hasSettings: true },
    });
    expect(validateManifest(m)).toEqual([]);
  });

  it("requires the access check to be one of the module's own SQL functions", () => {
    const ok = defineModule({
      ...base,
      slug: "crm",
      access: { check: "mod_crm_access_ok" },
    });
    expect(validateManifest(ok)).toEqual([]);
    const bad = defineModule({
      ...base,
      slug: "crm",
      access: { check: "is_admin" },
    });
    expect(validateManifest(bad)[0]).toContain("access.check");
  });

  it("rejects tables outside the module's prefix", () => {
    const m = defineModule({
      ...base,
      slug: "chat",
      database: { tables: ["chat_threads", "mod_billing_x"] },
    });
    const errors = validateManifest(m);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('"chat_threads"');
  });

  it("rejects cms slugs outside the prefix and double-declared settings", () => {
    const m = defineModule({
      ...base,
      slug: "billing",
      cms: {
        collections: ["plans"],
        globals: ["mod-billing-settings"],
        hasSettings: true,
      },
    });
    const errors = validateManifest(m);
    expect(errors.some((e) => e.includes('"plans"'))).toBe(true);
    expect(errors.some((e) => e.includes("implicit via cms.hasSettings"))).toBe(
      true,
    );
  });

  it("accepts an adapter that contributes a settings tab to a required target", () => {
    const m = defineModule({
      ...base,
      slug: "chat-adapter-slack",
      requires: ["chat"],
      cms: { settingsTabFor: "chat" },
    });
    expect(validateManifest(m)).toEqual([]);
  });

  it("rejects settingsTabFor whose target isn't a required dep", () => {
    const m = defineModule({
      ...base,
      slug: "chat-adapter-slack",
      cms: { settingsTabFor: "chat" },
    });
    expect(
      validateManifest(m).some((e) => e.includes("must be listed in requires")),
    ).toBe(true);
  });

  it("rejects settingsTabFor combined with hasSettings", () => {
    const m = defineModule({
      ...base,
      slug: "chat-adapter-slack",
      requires: ["chat"],
      cms: { settingsTabFor: "chat", hasSettings: true },
    });
    expect(
      validateManifest(m).some((e) => e.includes("mutually exclusive")),
    ).toBe(true);
  });

  it("rejects unprefixed edge functions and self-requires", () => {
    const m = defineModule({
      ...base,
      slug: "reminders",
      requires: ["reminders"],
      server: { edgeFunctions: ["process-reminders"] },
    });
    const errors = validateManifest(m);
    expect(errors.some((e) => e.includes('"process-reminders"'))).toBe(true);
    expect(errors.some((e) => e.includes("cannot require itself"))).toBe(true);
  });

  it("rejects reserved web mounts and unknown native mounts", () => {
    const m = defineModule({
      ...base,
      slug: "demo",
      routes: {
        web: [{ path: "", component: "C", mount: "/admin/tools" }],
        native: [{ path: "", component: "C", mount: "settings" }],
      },
    });
    const errors = validateManifest(m);
    expect(errors.some((e) => e.includes("reserved core route"))).toBe(true);
    expect(errors.some((e) => e.includes('native mount "settings"'))).toBe(
      true,
    );
  });

  it("keeps /embed for embed routes, each under its own /embed/<slug>", () => {
    const ok = defineModule({
      ...base,
      slug: "demo",
      routes: {
        web: [
          { path: "", component: "C", area: "embed" },
          { path: "", component: "D", area: "embed", mount: "/embed/demo/x" },
        ],
      },
    });
    expect(validateManifest(ok)).toEqual([]);
    const wrongSlug = defineModule({
      ...base,
      slug: "demo",
      routes: {
        web: [
          { path: "", component: "C", area: "embed", mount: "/embed/other" },
        ],
      },
    });
    expect(
      validateManifest(wrongSlug).some((e) =>
        e.includes("must be /embed/demo"),
      ),
    ).toBe(true);
    const notEmbed = defineModule({
      ...base,
      slug: "demo",
      routes: { web: [{ path: "", component: "C", mount: "/embed/demo" }] },
    });
    expect(
      validateManifest(notEmbed).some((e) => e.includes('use area: "embed"')),
    ).toBe(true);
  });

  it("rejects mounts inside the /a default namespace but allows bare /a", () => {
    const inside = defineModule({
      ...base,
      slug: "demo",
      routes: { web: [{ path: "", component: "C", mount: "/a/tools" }] },
    });
    expect(
      validateManifest(inside).some((e) =>
        e.includes("default-mount namespace"),
      ),
    ).toBe(true);

    const home = defineModule({
      ...base,
      slug: "dashboard",
      routes: { web: [{ path: "", component: "C", mount: "/a" }] },
    });
    expect(validateManifest(home)).toEqual([]);
  });

  it("rejects native surface on a web-only module", () => {
    const m = defineModule({
      ...base,
      slug: "demo",
      platforms: { web: true, native: false },
      nav: { native: [{ title: "Demo", href: "/a/demo" }] },
    });
    expect(
      validateManifest(m).some((e) => e.includes("platforms.native is false")),
    ).toBe(true);
  });
});

describe("validateManifestSet", () => {
  it("detects cross-module collisions", () => {
    const a = defineModule({
      ...base,
      slug: "alpha",
      database: { tables: ["mod_alpha"] },
      routes: { web: [{ path: "", component: "A", mount: "/shared" }] },
    });
    const b = defineModule({
      ...base,
      slug: "beta",
      database: { tables: ["mod_alpha"] },
      routes: { web: [{ path: "", component: "B", mount: "/shared" }] },
    });
    const errors = validateManifestSet([a, b]);
    expect(errors.some((e) => e.includes('table "mod_alpha"'))).toBe(true);
    expect(errors.some((e) => e.includes('web mount "/shared"'))).toBe(true);
  });

  it("requires dependencies to be installed", () => {
    const a = defineModule({
      ...base,
      slug: "reminders",
      requires: ["notifications"],
    });
    const errors = validateManifestSet([a]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('requires "notifications"');
  });

  it("points at a stale dependency when its newer table is missing", () => {
    const crm = defineModule({
      ...base,
      slug: "crm",
      version: "1.1.1",
      database: { tables: ["mod_crm_contacts"] },
    });
    const portal = defineModule({
      ...base,
      slug: "client-portal",
      requires: ["crm"],
      database: {
        dml: ["mod_crm_contacts", "mod_crm_cases"],
        triggersOn: ["mod_crm_cases"],
      },
    });
    const errors = validateManifestSet([crm, portal]);
    expect(errors).toHaveLength(2);
    for (const e of errors) {
      expect(e).toContain('"mod_crm_cases"');
      expect(e).toContain("installed crm@1.1.1");
      expect(e).toContain("pnpm mod update crm");
    }
  });

  it("passes a valid set", () => {
    const notif = defineModule({ ...base, slug: "notifications" });
    const rem = defineModule({
      ...base,
      slug: "reminders",
      requires: ["notifications"],
    });
    expect(validateManifestSet([notif, rem])).toEqual([]);
  });
});

describe("lintModuleSql", () => {
  const opts = {
    slug: "chat",
    file: "001_initial.sql",
    ownTables: ["mod_chat_threads", "mod_chat_messages"],
  };

  it("accepts SQL that only touches owned tables (auth.uid() allowed)", () => {
    const sql = `
      create table public.mod_chat_threads (
        id uuid primary key,
        user_id uuid not null
      );
      alter table public.mod_chat_threads enable row level security;
      create policy "own" on public.mod_chat_threads
        for all to authenticated using (user_id = (select auth.uid()));
      create index x on public.mod_chat_threads (user_id);
    `;
    expect(lintModuleSql(sql, opts)).toEqual([]);
  });

  it("flags DDL on undeclared tables", () => {
    const sql = `alter table public.profiles add column hacked boolean;`;
    const errors = lintModuleSql(sql, opts);
    expect(errors.some((e) => e.includes('"profiles"'))).toBe(true);
  });

  it("flags auth/storage references and role/grant DDL", () => {
    const errors = lintModuleSql(
      `
      update auth.users set email = 'x';
      grant all on public.mod_chat_threads to anon;
      create role hacker;
      insert into storage.buckets (id) values ('x');
    `,
      opts,
    );
    expect(errors.some((e) => e.includes("auth schema"))).toBe(true);
    expect(errors.some((e) => e.includes("GRANT"))).toBe(true);
    expect(errors.some((e) => e.includes("role DDL"))).toBe(true);
    expect(errors.some((e) => e.includes("storage schema"))).toBe(true);
  });

  it("allows whitelisted DML from requires and rejects the rest", () => {
    const sql = `
      insert into public.mod_notifications (user_id) values ('x');
      insert into public.tags (name) values ('y');
    `;
    const errors = lintModuleSql(sql, {
      ...opts,
      allowedDmlTables: ["mod_notifications"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"tags"');
  });

  it("treats legacy ext_ table names as the module's own mod_ tables", () => {
    const sql = `
      create table public.ext_chat_threads (id uuid primary key);
      alter table if exists public.ext_chat_threads rename to mod_chat_threads;
      insert into public.ext_notifications (user_id) values ('x');
    `;
    expect(
      lintModuleSql(sql, { ...opts, allowedDmlTables: ["mod_notifications"] }),
    ).toEqual([]);
    expect(
      lintModuleSql(`create table public.ext_billing_x (id int);`, opts),
    ).toHaveLength(1);
  });

  it("ignores commented-out SQL", () => {
    expect(lintModuleSql(`-- drop table public.profiles;`, opts)).toEqual([]);
  });

  it("does not read policy, trigger or FK 'update' clauses as DML", () => {
    const sql = `
      create policy "upd" on public.mod_chat_threads
        for update to authenticated using (true) with check (true);
      create policy "upd2" on public.mod_chat_threads for update using (true);
      create trigger mod_chat_touch before update on public.mod_chat_threads
        for each row execute function public.mod_chat_touch();
      create trigger mod_chat_x after insert or update of title on public.mod_chat_threads
        for each row execute function public.mod_chat_touch();
      create table public.mod_chat_messages (
        thread_id uuid references public.mod_chat_threads (id) on update cascade on delete cascade
      );
      insert into public.mod_chat_threads (id) values ('x')
        on conflict (id) do update set id = excluded.id;
    `;
    expect(lintModuleSql(sql, opts)).toEqual([]);
  });

  it("still catches real UPDATE statements on foreign tables", () => {
    for (const sql of [
      `update public.profiles set display_name = 'x';`,
      `update only profiles set display_name = 'x';`,
      `update profiles as p set display_name = 'x';`,
      `update "profiles" set display_name = 'x';`,
      `with x as (update profiles set display_name = 'x' returning id) select 1;`,
    ]) {
      const errors = lintModuleSql(sql, opts);
      expect(
        errors.some((e) => e.includes('"profiles"')),
        sql,
      ).toBe(true);
    }
    expect(
      lintModuleSql(`update public.mod_chat_threads t set title = 'x';`, opts),
    ).toEqual([]);
  });

  it("allows triggers only on declared hook-point tables, with a mod_ name", () => {
    const sql = `
      create trigger mod_chat_on_org after insert on public.organizations
        for each row execute function public.mod_chat_on_org();
    `;
    expect(lintModuleSql(sql, opts)).toHaveLength(1);
    expect(
      lintModuleSql(sql, { ...opts, triggerTables: ["organizations"] }),
    ).toEqual([]);
    const badName = `create or replace trigger on_org after insert on public.organizations
      for each row execute function public.mod_chat_on_org();`;
    const errors = lintModuleSql(badName, {
      ...opts,
      triggerTables: ["organizations"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("mod_chat_*");
  });
});

describe("database.triggersOn", () => {
  it("accepts core hook-points and required modules' tables", () => {
    const notif = defineModule({
      ...base,
      slug: "notifications",
      database: { tables: ["mod_notifications"] },
    });
    const crm = defineModule({
      ...base,
      slug: "crm",
      requires: ["notifications"],
      database: {
        tables: ["mod_crm_accounts"],
        triggersOn: ["organizations", "profiles", "mod_notifications"],
      },
    });
    expect(validateManifest(crm)).toEqual([]);
    expect(validateManifestSet([notif, crm])).toEqual([]);
  });

  it("rejects arbitrary core tables and tables of modules not required", () => {
    const other = defineModule({
      ...base,
      slug: "other",
      database: { tables: ["mod_other_x"] },
    });
    const crm = defineModule({
      ...base,
      slug: "crm",
      database: { triggersOn: ["subscriptions", "mod_other_x"] },
    });
    expect(validateManifest(crm)).toHaveLength(1);
    expect(validateManifestSet([other, crm])).toHaveLength(1);
  });
});
