import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Manifest } from "./align-deps";
import { alignInstalledModules, alignManifest, hostSpecs } from "./align-deps";

describe("hostSpecs", () => {
  it("keeps the spec the app's packages agree on, skipping workspace links", () => {
    const host = hostSpecs([
      {
        dependencies: { "expo-router": "~58.0.33", "@acme/ui": "workspace:*" },
      },
      { dependencies: { "expo-router": "~58.0.33", zod: "catalog:" } },
      { devDependencies: { typescript: "catalog:" } },
    ]);
    expect(Object.fromEntries(host)).toEqual({
      "expo-router": "~58.0.33",
      zod: "catalog:",
      typescript: "catalog:",
    });
  });

  it("drops a package the app's own packages disagree on", () => {
    const host = hostSpecs([
      { dependencies: { lodash: "^4.17.0" } },
      { dependencies: { lodash: "^4.18.0" } },
    ]);
    expect(host.has("lodash")).toBe(false);
  });
});

describe("alignManifest", () => {
  const host = new Map([
    ["expo-router", "~58.0.33"],
    ["zod", "catalog:"],
  ]);

  it("moves the module to the app's specs, catalog included", () => {
    const mod: Manifest = {
      dependencies: {
        "expo-router": "~58.0.30",
        zod: "4.6.7",
        "expo-document-picker": "~58.0.5",
        "@acme/api": "workspace:*",
      },
    };
    expect(alignManifest(mod, host)).toEqual([
      "expo-router: ~58.0.30 → ~58.0.33",
      "zod: 4.6.7 → catalog:",
    ]);
    expect(mod.dependencies).toEqual({
      "expo-router": "~58.0.33",
      zod: "catalog:",
      "expo-document-picker": "~58.0.5",
      "@acme/api": "workspace:*",
    });
  });

  it("changes nothing when the module already matches", () => {
    const mod: Manifest = { devDependencies: { "expo-router": "~58.0.33" } };
    expect(alignManifest(mod, host)).toEqual([]);
  });
});

describe("alignInstalledModules", () => {
  it("rewrites only modules that differ, keeping the file's layout", () => {
    const root = mkdtempSync(path.join(tmpdir(), "align-"));
    const write = (rel: string, json: unknown) => {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), `${JSON.stringify(json, null, 2)}\n`);
    };
    write("package.json", { devDependencies: { prettier: "catalog:" } });
    write("apps/expo/package.json", {
      dependencies: { "expo-router": "~58.0.33" },
    });
    write("modules/projects/package.json", {
      name: "@acme/mod-projects",
      dependencies: { "expo-router": "~58.0.30" },
      peerDependencies: { "expo-router": "*" },
    });
    write("modules/crm/package.json", {
      dependencies: { "expo-router": "~58.0.33" },
    });

    expect(alignInstalledModules(root)).toEqual([
      { slug: "projects", changes: ["expo-router: ~58.0.30 → ~58.0.33"] },
    ]);
    expect(
      readFileSync(path.join(root, "modules/projects/package.json"), "utf8"),
    ).toBe(
      `${JSON.stringify(
        {
          name: "@acme/mod-projects",
          dependencies: { "expo-router": "~58.0.33" },
          peerDependencies: { "expo-router": "*" },
        },
        null,
        2,
      )}\n`,
    );
    expect(alignInstalledModules(root)).toEqual([]);
  });
});
