import "server-only";

import type { BasePayload } from "payload";
import { z } from "zod/v4";

import type { ModPublicRouteTable, ModRouteTable } from "@acme/mod-kit/server";
import { APP_NAME } from "@acme/config";
import { isCronRequest } from "@acme/mod-kit/cron";
import { getModuleSettings } from "@acme/mod-kit/payload";

import type { FeedbackSettings } from "../payload/settings";
import { settings as settingsDef } from "../payload/settings";
import { createAdminClient } from "./admin-client";
import { runDigest } from "./digest";
import { handle, json, must, ok, parseBody, staff } from "./http";

async function appName(payload: BasePayload): Promise<string> {
  try {
    const g = (await payload.findGlobal({
      slug: "theme-settings",
      depth: 0,
    })) as { appName?: string | null };
    return g.appName?.trim() ?? APP_NAME;
  } catch {
    return APP_NAME;
  }
}

export const digestPublicRoutes: ModPublicRouteTable = {
  /** Supabase Cron, daily 14:17 UTC; weekly digests go out on Mondays. */
  "GET /cron/digest": handle(async (req, ctx) => {
    if (!isCronRequest(req)) return json(401, { error: "Unauthorized" });
    const payload = await ctx.getPayload();
    const s = await getModuleSettings<FeedbackSettings>(payload, settingsDef);
    const result = await runDigest({
      db: createAdminClient(),
      sendEmail: (msg) => payload.sendEmail(msg),
      cadence: s.digest ?? "weekly",
      staleAfterWeeks: s.staleAfterWeeks ?? 4,
      appName: await appName(payload),
      siteUrl: payload.config.serverURL
        ? payload.config.serverURL
        : (process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin),
    });
    return ok(result);
  }),
};

export const digestStaffRoutes: ModRouteTable = {
  /** The caller's own digest preference (default: on). */
  "GET /staff/prefs": staff(async (_req, ctx) => {
    const { data } = await ctx.supabase
      .from("mod_feedback_staff_prefs")
      .select("digest")
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    const s = await getModuleSettings<FeedbackSettings>(
      await ctx.getPayload(),
      settingsDef,
    );
    return ok({ digest: data?.digest ?? true, cadence: s.digest ?? "weekly" });
  }),

  "POST /staff/prefs": staff(async (req, ctx) => {
    const input = await parseBody(req, z.object({ digest: z.boolean() }));
    must(
      await ctx.supabase.from("mod_feedback_staff_prefs").upsert({
        user_id: ctx.user.id,
        digest: input.digest,
        updated_at: new Date().toISOString(),
      }),
    );
    return ok({ digest: input.digest });
  }),
};
