import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Server code starts with `import "server-only"`, whose real module
      // throws outside a Server Components build.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Live-database suites run under `pnpm test:rls` (tooling/rls-tests).
    exclude: ["tests/rls/**", "**/node_modules/**"],
  },
});
