import "server-only";

import type { ModRouteTable } from "@acme/mod-kit/server";

import type { Insights } from "../shared/insights";
import { must, ok, staff } from "./http";

const PERIODS = new Set([7, 30, 90, 365]);

export const insightsRoutes: ModRouteTable = {
  /** `GET /staff/insights?days=30&board=<id>` — the Insights tab. */
  "GET /staff/insights": staff(async (req, ctx) => {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") ?? 30);
    const period = PERIODS.has(days) ? days : 30;
    const board = url.searchParams.get("board") ?? undefined;
    const data = must(
      await ctx.supabase.rpc("mod_feedback_insights", {
        _since: new Date(Date.now() - period * 86400_000).toISOString(),
        _board: board,
      }),
    ) as unknown as Insights;
    return ok({ days: period, ...data });
  }),
};
