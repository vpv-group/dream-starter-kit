import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";
import type { ModPublicRouteTable } from "@acme/mod-kit/server";
import { ingestFeedback } from "@acme/mod-feedback/server";
import { isCronRequest } from "@acme/mod-kit/cron";
import { getAdapterSettings } from "@acme/mod-kit/payload";

import type { ChatSourceSettings } from "../payload/settings";
import { settings } from "../payload/settings";
import { parseKeywords } from "./filter";
import { scanChat } from "./scan";

/**
 * Chat messages belong to their senders (RLS read-own), so the scan reads
 * them with the service role — server-only, from the cron (golden rule #2).
 */
function serviceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set — see .env.example.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const publicRoutes: ModPublicRouteTable = {
  /** Supabase Cron, every 15 minutes. */
  "GET /cron/scan": async (req, ctx) => {
    if (!isCronRequest(req)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const s = await getAdapterSettings<ChatSourceSettings>(
      await ctx.getPayload(),
      settings,
    );
    if (!s.enabled) return Response.json({ skipped: "disabled" });
    const result = await scanChat(serviceClient(), {
      keywords: parseKeywords(s.keywords),
      minLength: typeof s.minLength === "number" ? s.minLength : 20,
      ingest: ingestFeedback,
    });
    return Response.json(result);
  },
};
