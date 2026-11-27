import { describe, expect, it } from "vitest";

import { defineModule } from "@acme/mod-kit";

import type { LoadedModule } from "./manifests";
import {
  applyEnvExampleBlock,
  buildAllGeneratedFiles,
  buildEnvExampleBlock,
  buildExpoRegistry,
  buildNextAdminRegistry,
  buildNextClientRegistry,
  buildNextDataRegistry,
  buildNextPayloadRegistry,
  buildNextServerRegistry,
  buildStubs,
  buildTranspileJson,
  gatedDefaultExport,
} from "./generate";
import { bumpVersion, dependencyOrder, nextVersion } from "./migrations";

function loaded(
  manifest: Parameters<typeof defineModule>[0],
  envClientKeys: string[] = [],
): LoadedModule {
  const m = defineModule(manifest);
  return {
    manifest: m,
    dir: `/repo/modules/${m.slug}`,
    packageName: `@acme/mod-${m.slug}`,
    envClientKeys,
    envServerKeys: [],
    payloadMigrations: [],
  };
}

const chat = loaded({
  slug: "chat",
  name: "AI Chat",
  version: "1.0.0",
  kitCompat: ">=2.0.0 <3",
  nav: {
    web: [
      { title: "Chat", href: "/a/chat", icon: "IconMessageCircle", order: 20 },
    ],
  },
  routes: {
    web: [
      { path: "", component: "ChatHome" },
      { path: "[threadId]", component: "ChatThread" },
    ],
    native: [{ path: "", component: "ChatHome" }],
  },
  widgets: { web: "ChatWidget" },
  server: { routes: true },
  database: { tables: ["mod_chat_threads"] },
});

const billing = loaded({
  slug: "billing",
  name: "Billing",
  version: "1.0.0",
  kitCompat: ">=2.0.0 <3",
  routes: {
    web: [
      { path: "", component: "BillingPage", mount: "/billing" },
      { path: "", component: "PricingPage", area: "public", mount: "/pricing" },
    ],
  },
});

describe("generated registries", () => {
  it("emits an inert empty state", () => {
    const data = buildNextDataRegistry([]);
    expect(data).toContain("export const modInstalled: ModInstalled[] = []");
    const client = buildNextClientRegistry([]);
    expect(client).toContain('export * from "./registry.data.generated";');
    expect(client).not.toContain("@tabler/icons-react");
    const server = buildNextServerRegistry([]);
    expect(server).toContain('import "server-only"');
    expect(server).toContain("= {}");
  });

  it("puts embed routes in the bare (embed) group under /embed/<slug>", () => {
    const embed = loaded({
      slug: "widgety",
      name: "Widgety",
      version: "1.0.0",
      kitCompat: ">=2.0.0 <3",
      routes: {
        web: [
          { path: "", component: "EmbedHome", area: "embed" },
          { path: "p/[post]", component: "EmbedPost", area: "embed" },
        ],
      },
    });
    const paths = buildStubs([embed]).map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "apps/nextjs/src/app/(frontend)/(embed)/embed/widgety/page.tsx",
        "apps/nextjs/src/app/(frontend)/(embed)/embed/widgety/p/[post]/page.tsx",
        "apps/nextjs/src/app/(frontend)/(embed)/embed/widgety/layout.tsx",
      ]),
    );
  });

  it("emits modMcp only for modules declaring server.mcp", () => {
    const withMcp = loaded({
      slug: "feedback-x",
      name: "Feedback X",
      version: "1.0.0",
      kitCompat: ">=2.0.0 <3",
      server: { routes: true, mcp: true },
    });
    const out = buildNextServerRegistry([chat, withMcp]);
    expect(out).toContain(
      'import { routes as routes_feedback_x, mcp as mcp_feedback_x } from "@acme/mod-feedback-x/server";',
    );
    expect(out).toMatch(
      /modMcp: Record<string, ModMcpExtension> = \{\n {2}"feedback-x": mcp_feedback_x,\n\}/,
    );
  });

  it("bakes nav defaults, widgets and icons as literals", () => {
    const out = buildNextClientRegistry([chat]);
    expect(out).toContain(
      'import { IconMessageCircle } from "@tabler/icons-react";',
    );
    expect(out).toContain(
      'import { ChatWidget as widget_chat } from "@acme/mod-chat/web";',
    );
    const data = buildNextDataRegistry([chat]);
    // Same key the boot reconcile gives the nav-items row.
    expect(data).toContain('key: "mod:chat:/a/chat"');
    expect(data).toContain('icon: "IconMessageCircle"');
  });

  it("maps native module screens by href for the tab bar", () => {
    const out = buildExpoRegistry([chat]);
    expect(out).toContain(
      'import { ChatHome as screen_chat_0 } from "@acme/mod-chat/native";',
    );
    expect(out).toContain('"/a/chat": screen_chat_0,');
  });

  it("keeps the data registry free of imports (safe for server code and CLIs)", () => {
    const data = buildNextDataRegistry([chat, billing]);
    expect(data).not.toMatch(/^import /m);
    expect(data).toContain("export function hasModule");
  });

  it("is deterministic", () => {
    const a = buildAllGeneratedFiles([chat, billing]);
    const b = buildAllGeneratedFiles([chat, billing]);
    expect(a).toEqual(b);
  });

  it("lists module packages for transpilePackages", () => {
    expect(JSON.parse(buildTranspileJson([chat, billing]))).toEqual([
      "@acme/mod-chat",
      "@acme/mod-billing",
    ]);
  });
});

describe("buildStubs", () => {
  it("generates default-mount stubs with an enabled-gating layout", () => {
    const paths = buildStubs([chat]).map((f) => f.path);
    expect(paths).toContain(
      "apps/nextjs/src/app/(frontend)/(app)/a/chat/page.tsx",
    );
    expect(paths).toContain(
      "apps/nextjs/src/app/(frontend)/(app)/a/chat/[threadId]/page.tsx",
    );
    expect(paths).toContain(
      "apps/nextjs/src/app/(frontend)/(app)/a/chat/layout.tsx",
    );
    expect(paths).toContain("apps/expo/src/app/(app)/a/chat/index.tsx");
  });

  it("generates mount-override stubs in the right layout groups", () => {
    const files = buildStubs([billing]);
    const paths = files.map((f) => f.path);
    expect(paths).toContain(
      "apps/nextjs/src/app/(frontend)/(app)/billing/page.tsx",
    );
    expect(paths).toContain(
      "apps/nextjs/src/app/(frontend)/(public)/pricing/page.tsx",
    );
    const stub = files.find((f) => f.path.endsWith("(app)/billing/page.tsx"));
    expect(stub?.content).toContain(
      'export { BillingPage as default } from "@acme/mod-billing/web";',
    );
    expect(stub?.slug).toBe("billing");
  });

  it("generates nested dynamic stubs for multi-segment paths", () => {
    const crm = loaded({
      slug: "crm",
      name: "CRM",
      version: "1.0.0",
      kitCompat: ">=2.0.0 <3",
      routes: {
        web: [
          { path: "", component: "CrmHome" },
          { path: "[object]", component: "ObjectList" },
          { path: "[object]/[id]", component: "RecordPage" },
          { path: "settings", component: "CrmSettings" },
        ],
        native: [
          { path: "", component: "CrmHomeScreen" },
          { path: "[object]/index", component: "ObjectListScreen" },
          { path: "[object]/[id]", component: "RecordScreen" },
        ],
      },
    });
    const files = buildStubs([crm]);
    const paths = files.map((f) => f.path);
    const web = "apps/nextjs/src/app/(frontend)/(app)/a/crm";
    expect(paths).toEqual(
      expect.arrayContaining([
        `${web}/page.tsx`,
        `${web}/[object]/page.tsx`,
        `${web}/[object]/[id]/page.tsx`,
        `${web}/settings/page.tsx`,
        "apps/expo/src/app/(app)/a/crm/index.tsx",
        "apps/expo/src/app/(app)/a/crm/[object]/index.tsx",
        "apps/expo/src/app/(app)/a/crm/[object]/[id].tsx",
      ]),
    );
    // One enabled-gating layout for the whole mount, not one per segment.
    expect(paths.filter((p) => p.endsWith("/layout.tsx"))).toEqual([
      `${web}/layout.tsx`,
    ]);
    expect(
      files.find((f) => f.path === `${web}/[object]/[id]/page.tsx`)?.content,
    ).toContain('export { RecordPage as default } from "@acme/mod-crm/web";');
  });
});

describe("env example fence", () => {
  it("replaces the fenced block idempotently", () => {
    const mod = loaded(
      {
        slug: "chat",
        name: "AI Chat",
        version: "1.0.0",
        kitCompat: ">=1",
        env: { hasServer: false, hasClient: true },
      },
      ["MOD_CHAT_FLAG"],
    );
    const block = buildEnvExampleBlock([mod]);
    const once = applyEnvExampleBlock("# base env\n", block);
    expect(once).toContain("# NEXT_PUBLIC_MOD_CHAT_FLAG=");
    expect(once).toContain("# EXPO_PUBLIC_MOD_CHAT_FLAG=");
    const twice = applyEnvExampleBlock(once, block);
    expect(twice).toBe(once);
  });
});

describe("migration version assignment", () => {
  it("bumps 14-digit versions as real timestamps", () => {
    expect(bumpVersion("20261231235959")).toBe("20270101000000");
  });

  it("assigns strictly increasing unused versions", () => {
    const taken = new Set(["20260609000001", "20270101000000"]);
    const now = new Date(Date.UTC(2026, 5, 11, 12, 0, 0));
    const v1 = nextVersion(taken, now);
    expect(v1).toBe("20270101000001");
    taken.add(v1);
    expect(nextVersion(taken, now)).toBe("20270101000002");
  });

  it("uses the current time when it is already past every taken version", () => {
    const taken = new Set(["20260609000001"]);
    const now = new Date(Date.UTC(2026, 5, 11, 12, 0, 0));
    expect(nextVersion(taken, now)).toBe("20260611120000");
  });
});

describe("gated native stubs", () => {
  it("wrap like Prettier when the line is too long", () => {
    expect(gatedDefaultExport('"mod_crm_access_ok"', "CrmScreen")).toBe(
      'export default withModuleAccess("mod_crm_access_ok", CrmScreen);',
    );
    expect(
      gatedDefaultExport('"mod_client_portal_access_ok"', "PortalTicketScreen"),
    ).toBe(
      'export default withModuleAccess(\n  "mod_client_portal_access_ok",\n  PortalTicketScreen,\n);',
    );
  });
});

describe("migration pin order", () => {
  const mod = (slug: string, requires: string[] = []) => ({
    manifest: { slug, requires },
  });

  it("puts a module after the modules it requires", () => {
    const order = dependencyOrder([
      mod("client-portal", ["crm", "notifications"]),
      mod("crm", ["notifications"]),
      mod("chat"),
      mod("notifications"),
    ]).map((m) => m.manifest.slug);
    expect(order.indexOf("notifications")).toBeLessThan(order.indexOf("crm"));
    expect(order.indexOf("crm")).toBeLessThan(order.indexOf("client-portal"));
    expect(order).toHaveLength(4);
  });

  it("keeps the input order when there are no dependencies, and survives cycles", () => {
    expect(
      dependencyOrder([mod("b"), mod("a"), mod("c")]).map(
        (m) => m.manifest.slug,
      ),
    ).toEqual(["b", "a", "c"]);
    expect(
      dependencyOrder([mod("x", ["y"]), mod("y", ["x"])]).map(
        (m) => m.manifest.slug,
      ),
    ).toHaveLength(2);
  });
});

describe("module access + admin settings", () => {
  const crm = loaded({
    slug: "crm",
    name: "CRM",
    version: "1.1.0",
    kitCompat: ">=2.0.0 <3",
    nav: {
      web: [{ title: "CRM", href: "/a/crm", order: 20, audience: "staff" }],
      native: [{ title: "CRM", href: "/a/crm", order: 20 }],
    },
    routes: {
      web: [{ path: "", component: "CrmPage" }],
      native: [{ path: "", component: "CrmScreen" }],
    },
    access: { check: "mod_crm_access_ok" },
    admin: { settingsComponent: true },
  });

  it("gates the web layout with the access check", () => {
    const layout = buildStubs([crm]).find((f) =>
      f.path.endsWith("/a/crm/layout.tsx"),
    );
    expect(layout?.content).toContain(
      'if (!(await hasModuleAccess("mod_crm_access_ok"))) redirect("/a");',
    );
    expect(layout?.content).toContain(
      'import { notFound, redirect } from "next/navigation";',
    );
    // Ungated modules keep the plain enabled-only layout.
    const plain = buildStubs([chat]).find((f) =>
      f.path.endsWith("/a/chat/layout.tsx"),
    );
    expect(plain?.content).not.toContain("hasModuleAccess");
  });

  it("wraps native screens in the access gate", () => {
    const screen = buildStubs([crm]).find(
      (f) => f.path === "apps/expo/src/app/(app)/a/crm/index.tsx",
    );
    expect(screen?.content).toContain(
      'export default withModuleAccess("mod_crm_access_ok", CrmScreen);',
    );
  });

  it("bakes the access check and staff-only nav defaults into the registries", () => {
    const data = buildNextDataRegistry([crm]);
    expect(data).toContain('accessCheck: "mod_crm_access_ok"');
    expect(data).toContain('audience: "staff"');
    const expo = buildExpoRegistry([crm]);
    expect(expo).toContain('accessCheck: "mod_crm_access_ok"');
    // Gated screens stay gated when rendered inside a tab slot.
    expect(expo).toContain('import { withModuleAccess } from "./access-gate";');
    expect(expo).toContain(
      '"/a/crm": withModuleAccess("mod_crm_access_ok", screen_crm_0),',
    );
  });

  it("flattens web submenu children into rows that point at their parent", () => {
    const grouped = loaded({
      slug: "crm",
      name: "CRM",
      version: "1.3.0",
      kitCompat: ">=2.5.0 <3",
      nav: {
        web: [
          {
            title: "CRM",
            href: "/a/crm",
            icon: "IconBriefcase",
            order: 20,
            children: [
              { title: "Leads", href: "/a/crm/leads", icon: "IconUserPlus" },
              { title: "Cases", href: "/a/crm/cases", audience: "members" },
            ],
          },
        ],
        native: [{ title: "CRM", href: "/a/crm", order: 20 }],
      },
      routes: { web: [{ path: "", component: "CrmPage" }] },
    });
    const data = buildNextDataRegistry([grouped]);
    expect(data).toContain(
      '{ key: "mod:crm:/a/crm/leads", module: "crm", title: "Leads", href: "/a/crm/leads", icon: "IconUserPlus", order: 20.01, parent: "mod:crm:/a/crm" },',
    );
    expect(data).toContain(
      '{ key: "mod:crm:/a/crm/cases", module: "crm", title: "Cases", href: "/a/crm/cases", order: 20.02, audience: "members", parent: "mod:crm:/a/crm" },',
    );
    // Native stays flat, and child icons reach the web icon map.
    expect(buildExpoRegistry([grouped])).not.toContain("/a/crm/leads");
    expect(buildNextClientRegistry([grouped])).toContain("IconUserPlus");
  });

  it("lists ./admin settings components for the module page", () => {
    expect(buildNextPayloadRegistry([crm])).toContain('{ slug: "crm" },');
    const admin = buildNextAdminRegistry([crm]);
    expect(admin.startsWith('"use client";')).toBe(true);
    expect(admin).toContain(
      'import { AdminSettings as admin_crm } from "@acme/mod-crm/admin";',
    );
    expect(admin).toContain("crm: admin_crm,");
    expect(buildNextAdminRegistry([chat])).toContain(
      "modAdminComponents: Record<string, ComponentType> = {};",
    );
  });
});
