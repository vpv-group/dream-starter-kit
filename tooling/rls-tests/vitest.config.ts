import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Module suites may import server code (`import "server-only"`).
      "server-only": fileURLToPath(
        new URL("./src/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    // Scan from the repo root so module-owned RLS suites
    // (modules/<slug>/tests/rls/**/*.test.ts) run with the kit's — see
    // docs/MODULES.md → Module tests.
    dir: "../..",
    include: [
      "tooling/rls-tests/src/**/*.test.ts",
      "modules/*/tests/rls/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**"],
    // One file at a time: module suites share database-wide singletons (the
    // CRM's company CRM and access mode, the client portal's settings row),
    // so suites running side by side would change each other's setup.
    fileParallelism: false,
    // Generous: a freshly-booted CI Supabase can be slow to settle.
    testTimeout: 45_000,
    hookTimeout: 45_000,
    retry: process.env.CI ? 1 : 0,
  },
});
