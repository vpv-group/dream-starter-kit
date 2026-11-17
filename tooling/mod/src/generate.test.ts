import { describe, expect, it } from "vitest";

import { defineModule } from "@acme/mod-kit";

import type { LoadedModule } from "./manifests";
import {
  applyEnvExampleBlock,
  buildAllGeneratedFiles,
  buildEnvExampleBlock,
  buildNextClientRegistry,
  buildNextDataRegistry,
  buildNextServerRegistry,
  buildStubs,
  buildTranspileJson,
} from "./generate";
import { bumpVersion, nextVersion } from "./migrations";

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

  it("bakes nav defaults, widgets and icons as literals", () => {
    const out = buildNextClientRegistry([chat]);
    expect(out).toContain(
      'import { IconMessageCircle } from "@tabler/icons-react";',
    );
    expect(out).toContain(
      'import { ChatWidget as widget_chat } from "@acme/mod-chat/web";',
    );
    const data = buildNextDataRegistry([chat]);
    expect(data).toContain('key: "mod:chat:0"');
    expect(data).toContain('icon: "IconMessageCircle"');
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
