import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { FOUNDER_STORAGE_STATE } from "./helpers/founder";
import { setSiteKey } from "./helpers/site-key";

/**
 * /admin → Updates and installing from the catalog (docs/MODULES.md →
 * Automatic updates). meetdream.com and the GitHub API are the stub server
 * (stub-services.mjs), which the app calls server-side; the spec sets the
 * scene through it and reads back what the app sent. The founder is the
 * admin. Serial: the stub's scene is shared.
 */

const STUB = "http://localhost:4010";
const SITE_KEY = "dsk_e2e_site_key";

interface LogEntry {
  type: string;
  body: Record<string, unknown> | null;
}

async function scene(body: Record<string, unknown>) {
  const res = await fetch(`${STUB}/__scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.ok).toBe(true);
}

async function sent(type: string): Promise<LogEntry[]> {
  const res = await fetch(`${STUB}/__log`);
  return ((await res.json()) as LogEntry[]).filter((e) => e.type === type);
}

/**
 * Open /admin → Updates and wait for its first load. The panel shows
 * "Loading updates…" until its client fetch of /api/modules/updates (which
 * calls Meet Dream + GitHub — the stub here) returns; on a cold `next dev`
 * that route compiles on first hit and outlasts the 5 s assertion timeout.
 */
async function openUpdates(page: Page) {
  await page.goto("/admin/updates");
  await expect(page.getByText("Loading updates…")).toBeHidden({
    timeout: 60_000,
  });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: FOUNDER_STORAGE_STATE });

test.beforeAll(() => setSiteKey(SITE_KEY));
test.afterAll(() => setSiteKey(null));

test("the update switches save to Meet Dream", async ({ page }) => {
  await scene({ connected: true });
  await openUpdates(page);
  await expect(page.getByText("Connected to acme/e2e-app")).toBeVisible();

  const merge = page.getByRole("switch", {
    name: "Merge updates automatically",
  });
  await expect(merge).toBeChecked();
  await merge.click();
  await expect(page.getByText("Every update now waits for you.")).toBeVisible();
  await expect(merge).not.toBeChecked();

  const saves = await sent("settings");
  expect(saves.at(-1)?.body).toMatchObject({
    autoUpdate: true,
    autoMerge: false,
  });
});

test("Meet Dream's hold, a paused merge and Merge now", async ({ page }) => {
  await scene({
    connected: true,
    hold: "Starter kit 2.4.0 is being fixed.",
    settings: { pausedReason: "The deploy after the last update failed." },
    prs: [
      {
        number: 7,
        title: "Update crm 1.0.0 → 1.1.0",
        html_url: "https://github.com/acme/e2e-app/pull/7",
        body: '<!-- dream-update {"kind":"module","op":"update","slug":"crm","to":"1.1.0","verified":true} -->',
        labels: [{ name: "dream-update" }],
        head: { ref: "dream/update-crm-1" },
      },
    ],
  });
  await openUpdates(page);
  await expect(
    page.getByText("Automatic merging is paused by Meet Dream"),
  ).toBeVisible();
  await expect(
    page.getByText("Starter kit 2.4.0 is being fixed."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Resume automatic merging" }).click();
  await expect(page.getByText("Automatic merging resumed.")).toBeVisible();
  expect((await sent("settings")).at(-1)?.body).toMatchObject({
    resume: true,
  });

  await expect(page.getByText("Update crm 1.0.0 → 1.1.0")).toBeVisible();
  await page.getByRole("button", { name: "Merge now" }).click();
  await expect
    .poll(async () => (await sent("dispatch")).at(-1)?.body)
    .toMatchObject({ inputs: { op: "merge", pr: "7" } });
});

test("not connected: Connect GitHub, and only catalog installs", async ({
  page,
}) => {
  await scene({ connected: false });
  await page.goto("/admin");
  await expect(page.getByText("Finish setup")).toBeVisible();

  await openUpdates(page);
  await page.getByRole("button", { name: "Connect GitHub" }).click();
  await page.waitForURL(`${STUB}/github-install?state=e2e`);
  expect((await sent("connect")).at(-1)?.body).toMatchObject({
    returnTo: expect.stringMatching(/\/admin\/updates$/),
  });

  // Connected: Install from the catalog dispatches a catalog slug only,
  // approved (it merges once its checks pass).
  await scene({ connected: true });
  await page.goto("/admin/collections/kit-modules");
  await page.getByRole("button", { name: "Install module" }).click();
  await page.getByRole("button", { name: "Install", exact: true }).click();
  await expect
    .poll(async () => (await sent("dispatch")).at(-1)?.body)
    .toMatchObject({
      inputs: { op: "add", source: "dream:crm", approved: "true" },
    });
});
