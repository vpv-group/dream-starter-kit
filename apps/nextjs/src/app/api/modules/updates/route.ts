import { z } from "zod/v4";

import { KIT_VERSION } from "@acme/config";

import type { GithubPr } from "~/lib/mod/ops-core";
import { getPayloadClient } from "~/lib/cms/payload-client";
import { getDreamSite } from "~/lib/dream/site";
import { githubApi, requireAdmin } from "~/lib/mod/admin-ops";
import { toOpsPrs } from "~/lib/mod/ops-core";
import { getUpdates, putUpdateSettings } from "~/lib/mod/updates";

/**
 * /admin → Updates (docs/MODULES.md → Automatic updates). GET: whether
 * GitHub is connected, the owner's settings and Meet Dream's hold (from
 * meetdream.com — the workflow reads the same settings there), plus the open
 * update PRs. PUT: save the settings. Staff-gated; the site key never
 * reaches the browser.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const updates = await getUpdates();
  let prs: ReturnType<typeof toOpsPrs> = [];
  if (updates.status === "ok" && updates.connected) {
    const res = await githubApi("/pulls?state=open&per_page=50");
    if (res.ok) prs = toOpsPrs((await res.json()) as GithubPr[]);
  }
  const licensePrefix = await getPayloadClient()
    .then(getDreamSite)
    .then((site) => site.licenseKeyPrefix ?? null)
    .catch(() => null);
  return Response.json({
    kitVersion: KIT_VERSION,
    licensePrefix,
    updates,
    prs,
  });
}

const putSchema = z.object({
  autoUpdate: z.boolean(),
  autoMerge: z.boolean(),
  paused: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)).max(100),
  skipped: z.array(z.string().max(96)).max(200),
  resume: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid settings" }, { status: 400 });
  }
  const res = await putUpdateSettings(parsed.data);
  return Response.json(res, { status: res.status === "ok" ? 200 : 502 });
}
