import { defineConfig } from "vitest/config";

export default defineConfig({
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
    // Generous: a freshly-booted CI Supabase can be slow to settle.
    testTimeout: 45_000,
    hookTimeout: 45_000,
    retry: process.env.CI ? 1 : 0,
  },
});
