import "server-only";

import type { ModPublicRouteTable, ModRouteTable } from "@acme/mod-kit/server";
import { isCronRequest } from "@acme/mod-kit/cron";
import { getModuleSettings } from "@acme/mod-kit/payload";

import type { TrackerRouteOptions } from "../integrations/routes";
import type { FeedbackSettings } from "../payload/settings";
import { githubProvider } from "../integrations/github";
import { createIssueTrackerRoutes, runSync } from "../integrations/routes";
import { githubSettings } from "../integrations/settings";
import { settings as settingsDef } from "../payload/settings";
import { handle, HttpError, json, must, ok } from "./http";

/** Built-in providers (adapters mount their own routes in their modules). */
const github: TrackerRouteOptions = {
  provider: githubProvider,
  base: "/integrations/github",
  loadSettings: async (getPayload) =>
    githubSettings(
      await getModuleSettings<FeedbackSettings>(
        await getPayload(),
        settingsDef,
      ),
    ),
};

const githubRoutes = createIssueTrackerRoutes(github);

export const integrationRoutes: ModRouteTable = {
  ...githubRoutes.routes,

  /** Registered providers (built-in + adapters) for the idea's issue panel. */
  "GET /integrations": handle(async (_req, ctx) => {
    const { data: staff } = await ctx.supabase.rpc("mod_feedback_is_staff");
    if (!staff) throw new HttpError(403, "Staff only.", "forbidden");
    const providers = must(
      await ctx.supabase
        .from("mod_feedback_integrations")
        .select(
          "provider, label, route_base, capabilities, enabled, last_synced_at, last_error",
        )
        .order("provider"),
    );
    return ok({ providers });
  }),
};

export const integrationPublicRoutes: ModPublicRouteTable = {
  ...githubRoutes.publicRoutes,

  /** Supabase Cron, every 2 minutes: sync every built-in provider. */
  "GET /cron/integrations-sync": handle(async (req, ctx) => {
    if (!isCronRequest(req)) return json(401, { error: "Unauthorized" });
    return ok({ results: [await runSync(github, ctx, req)] });
  }),
};
