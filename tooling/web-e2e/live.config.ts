import { defineConfig, devices } from "@playwright/test";

/**
 * Live checks against a DEPLOYED site (live/*.live.spec.ts). Never run by
 * `pnpm test:e2e` or CI: they talk to meetdream.com and Stripe test mode.
 * See live/stripe-connect.live.spec.ts for the env vars.
 */
export default defineConfig({
  testDir: "./live",
  testMatch: /\.live\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/live" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
