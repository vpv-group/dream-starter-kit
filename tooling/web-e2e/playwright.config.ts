import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const STUB_URL = "http://localhost:4010";

export default defineConfig({
  testDir: "./src",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI: annotate the run via the `github` reporter AND emit the static HTML
  // report into `playwright-report/` (default dir) so the workflow's
  // upload-artifact step has files to publish. `open: "never"` keeps it from
  // trying to launch a browser on failure. Local: concise `list` output.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // Tests run against `next dev`, where parallel workers all trigger
  // first-compiles of their routes — the 30s default times tests out on the
  // email-confirmation flows (sign-up → Mailpit → verify-link redirect chain).
  timeout: 120_000,
  // Local: cap the worker count — most specs start by signing up, and
  // concurrent signups (each sending a confirmation email inside GoTrue's
  // request window) compete with `next dev` compiles for CPU and can push
  // local GoTrue past its 10s gateway deadline (504s). CI keeps Playwright's
  // default (cores/2).
  workers: process.env.CI ? undefined : 2,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Runs first: provisions the founder (first sign-up) + seeds the CMS, so the
    // parallel suite below sees an existing founder and seeded content. See
    // src/founder.setup.ts.
    { name: "setup", testMatch: /founder\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        /founder\.setup\.ts/,
        /workspaces?[.-].*\.ts/,
        /stripe-connect\.spec\.ts/,
      ],
      dependencies: ["setup"],
    },
    // "Connect with Stripe" against the fake meetdream.com (stub-stripe.mjs).
    // After the main suite: updates.spec shares the stub server and the site
    // license key it sets and clears.
    {
      name: "stripe-connect",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /stripe-connect\.spec\.ts/,
      dependencies: ["chromium"],
    },
    // Workspace (B2B) specs need the site-wide account model set to Teams,
    // which would reroute every consumer sign-up running in parallel — so a
    // setup project flips it AFTER the main suite, and its teardown restores
    // Individuals once every workspace spec has finished (pass or fail).
    {
      name: "workspaces-setup",
      testMatch: /workspaces\.setup\.ts/,
      dependencies: ["chromium", "stripe-connect"],
      teardown: "workspaces-teardown",
    },
    { name: "workspaces-teardown", testMatch: /workspaces\.teardown\.ts/ },
    {
      name: "workspaces",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /workspace-.*\.spec\.ts/,
      dependencies: ["workspaces-setup"],
    },
    // Module-owned specs: modules/<slug>/e2e/*.spec.ts (docs/MODULES.md →
    // Module tests). Same founder setup, same dev server.
    {
      name: "modules",
      testDir: "../../modules",
      testMatch: /\/e2e\/.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  // Playwright starts the web app (reused locally if already running). The CI
  // workflow provisions Supabase + the .env before this runs.
  //
  // NB: we deliberately do NOT force NEXT_PUBLIC_TURNSTILE_SITE_KEY on here. The
  // Turnstile widget holds a live connection to challenges.cloudflare.com, which
  // keeps the page from ever reaching `networkidle` — several specs wait on that.
  // The suite runs with Supabase CAPTCHA OFF (config.toml), so anon sign-in /
  // sign-up / favorites need no token. To exercise the widget locally, set
  // NEXT_PUBLIC_TURNSTILE_SITE_KEY (Cloudflare's always-pass test key
  // 1x00000000000000000000AA) in .env — see docs/TURNSTILE.md.
  //
  // E2E_SERVER=prod (the kit's release.yml) runs against a production build
  // instead — `next build && next start` — so the production boot path
  // (runtime DB bootstrap, Payload prodMigrations) is exercised too.
  //
  // The stub server (stub-services.mjs) stands in for meetdream.com and the
  // GitHub API, which the app calls server-side (updates.spec.ts). A dev
  // server you started yourself is reused as is, so start it with the same
  // DREAM_REGISTRY_URL / DREAM_GITHUB_API_URL to run updates.spec.ts against it.
  webServer: [
    {
      command: "node stub-services.mjs",
      url: `${STUB_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    {
      command:
        process.env.E2E_SERVER === "prod"
          ? "pnpm --filter @acme/nextjs build && pnpm --filter @acme/nextjs start"
          : "pnpm --filter @acme/nextjs dev",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: process.env.E2E_SERVER === "prod" ? 900_000 : 120_000,
      env: {
        DREAM_REGISTRY_URL: `${STUB_URL}/registry`,
        DREAM_GITHUB_API_URL: `${STUB_URL}/github`,
      },
    },
  ],
});
