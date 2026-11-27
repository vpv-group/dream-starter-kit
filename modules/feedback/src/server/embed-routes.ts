import "server-only";

import { z } from "zod/v4";

import type { ModPublicRouteTable, ModRouteTable } from "@acme/mod-kit/server";
import { getModuleSettings } from "@acme/mod-kit/payload";

import type { FeedbackSettings } from "../payload/settings";
import { settings as settingsDef } from "../payload/settings";
import { parseEmbedOrigins } from "../shared/embed";
import { createAdminClient } from "./admin-client";
import { buildEmbedScript } from "./embed-script";
import { handle, HttpError, json, ok, parseBody, staff } from "./http";

export const embedPublicRoutes: ModPublicRouteTable = {
  /** The loader script sites paste in (cached an hour). */
  "GET /embed.js": handle(async (req, ctx) => {
    const payload = await ctx.getPayload();
    const s = await getModuleSettings<FeedbackSettings>(payload, settingsDef);
    const base = payload.config.serverURL
      ? payload.config.serverURL
      : (process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin);
    return new Response(buildEmbedScript(base, Boolean(s.embedEnabled)), {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),

  /**
   * When the newest public changelog entry was published — for the
   * changelog badge on other sites (CORS-open, nothing private).
   */
  "GET /embed/latest": handle(async (_req, ctx) => {
    const payload = await ctx.getPayload();
    const res = await payload.find({
      collection: "mod-feedback-changelog",
      where: {
        and: [
          { _status: { equals: "published" } },
          { audience: { equals: "everyone" } },
        ],
      },
      sort: "-publishedAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { publishedAt: true },
    });
    const latest =
      (res.docs[0] as { publishedAt?: string | null } | undefined)
        ?.publishedAt ?? null;
    return Response.json(
      { latest },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      },
    );
  }),
};

export const embedRoutes: ModRouteTable = {
  /** Widget status for the staff "Embed" dialog. */
  "GET /staff/widget": staff(async (_req, ctx) => {
    const s = await getModuleSettings<FeedbackSettings>(
      await ctx.getPayload(),
      settingsDef,
    );
    return ok({
      enabled: Boolean(s.embedEnabled),
      origins: parseEmbedOrigins(s.embedOrigins).origins,
    });
  }),

  /**
   * After signing in inside the widget: move the votes, posts and comments
   * the visitor made anonymously in the frame to their account. Requires
   * both sessions — the caller's (the account) and the anonymous one's
   * access token — so nobody can claim someone else's anonymous data.
   */
  "POST /claim-anon": handle(async (req, ctx) => {
    const input = await parseBody(
      req,
      z.object({ anonToken: z.string().min(20).max(4000) }),
    );
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(input.anonToken);
    if (error || !data.user.is_anonymous) {
      throw new HttpError(400, "That isn't an anonymous session.");
    }
    if (data.user.id === ctx.user.id) return ok({ merged: false });
    const merge = await admin.rpc("kit_merge_anon_data", {
      _from: data.user.id,
      _to: ctx.user.id,
    });
    if (merge.error) return json(500, { error: "Couldn't move your votes." });
    await admin.auth.admin.deleteUser(data.user.id);
    return ok({ merged: true });
  }),
};
