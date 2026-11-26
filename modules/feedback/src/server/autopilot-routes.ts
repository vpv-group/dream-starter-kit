import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { BasePayload, RequiredDataFromCollectionSlug } from "payload";
import { z } from "zod/v4";

import type {
  ModPublicRouteTable,
  ModRouteContext,
  ModRouteTable,
} from "@acme/mod-kit/server";
import { isCronRequest } from "@acme/mod-kit/cron";
import { getModuleSettings } from "@acme/mod-kit/payload";

import type { FeedbackSettings } from "../payload/settings";
import { settings as settingsDef } from "../payload/settings";
import { createAdminClient } from "./admin-client";
import { aiConfigured, gatewayAi, toVector } from "./ai";
import {
  autopilotSettings,
  draftChangelog,
  ingestFeedback,
  processInbox,
  processNewPosts,
  resolveInboxItem,
  summarizePost,
} from "./autopilot";
import { handle, HttpError, json, must, ok, parseBody } from "./http";

/**
 * Autopilot routes. AI runs only from the cron, staff routes, and the
 * members' semantic search — never for anonymous traffic (golden rule #6).
 */

async function loadAp(getPayload: () => Promise<BasePayload>) {
  const s = await getModuleSettings<FeedbackSettings>(
    await getPayload(),
    settingsDef,
  );
  return autopilotSettings(s.ap);
}

async function requireStaff(ctx: ModRouteContext) {
  const { data } = await ctx.supabase.rpc("mod_feedback_is_staff");
  if (!data) throw new HttpError(403, "Staff only.", "forbidden");
}

const staff = (fn: (req: Request, ctx: ModRouteContext) => Promise<Response>) =>
  handle(async (req: Request, ctx: ModRouteContext) => {
    await requireStaff(ctx);
    return fn(req, ctx);
  });

function requireAi() {
  if (!aiConfigured()) {
    throw new HttpError(
      503,
      "AI isn't configured (set AI_GATEWAY_API_KEY).",
      "ai_not_configured",
    );
  }
}

export const hashKey = (key: string) =>
  createHash("sha256").update(key).digest("hex");

const ingestInput = z.object({
  text: z.string().trim().min(3).max(10000),
  title: z.string().trim().max(200).nullish(),
  email: z.email().nullish(),
  name: z.string().trim().max(200).nullish(),
  source: z.string().trim().max(40).default("api"),
  ref: z.record(z.string(), z.unknown()).optional(),
});

export const autopilotPublicRoutes: ModPublicRouteTable = {
  /** Supabase Cron, every 5 minutes. */
  "GET /cron/autopilot": handle(async (req, ctx) => {
    if (!isCronRequest(req)) return json(401, { error: "Unauthorized" });
    const s = await loadAp(ctx.getPayload);
    if (!s.enabled) return ok({ skipped: "disabled" });
    if (!aiConfigured()) return ok({ skipped: "ai not configured" });
    const db = createAdminClient();
    const posts = await processNewPosts(db, gatewayAi, s);
    const inbox = await processInbox(db, gatewayAi, s);
    return ok({ posts, inbox });
  }),

  /**
   * Inbound feedback API (Zapier, support tools…):
   * `POST /api/mod/feedback/ingest` with `Authorization: Bearer fbk_…`.
   * Lands in the staff Inbox; never public until accepted.
   */
  "POST /ingest": handle(async (req) => {
    const token =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token.startsWith("fbk_"))
      return json(401, { error: "Missing API key" });
    const db = createAdminClient();
    const { data: key } = await db
      .from("mod_feedback_api_keys")
      .select("id")
      .eq("key_hash", hashKey(token))
      .is("revoked_at", null)
      .maybeSingle();
    if (!key) return json(401, { error: "Invalid API key" });
    const input = await parseBody(req, ingestInput);
    const id = await ingestFeedback(db, input);
    return json(202, { id });
  }),
};

export const autopilotStaffRoutes: ModRouteTable = {
  "GET /staff/autopilot": staff(async (_req, ctx) => {
    const s = await loadAp(ctx.getPayload);
    const items = must(
      await ctx.supabase
        .from("mod_feedback_inbox")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    );
    const postIds = [
      ...new Set(
        items
          .flatMap((i) => [i.post_id, i.suggested_post_id])
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const { data: posts } = postIds.length
      ? await ctx.supabase
          .from("mod_feedback_posts")
          .select("id, title, slug, board_id, vote_count")
          .in("id", postIds)
      : { data: [] };
    return ok({
      enabled: s.enabled,
      aiConfigured: aiConfigured(),
      actions: s.actions,
      items,
      posts: posts ?? [],
    });
  }),

  "POST /staff/autopilot/resolve": staff(async (req, ctx) => {
    const input = await parseBody(
      req,
      z.object({
        id: z.uuid(),
        action: z.enum(["accept", "merge", "dismiss"]),
        targetPostId: z.uuid().nullish(),
      }),
    );
    // Staff-checked above; the service role does the cross-user writes.
    const db = createAdminClient();
    const s = await loadAp(ctx.getPayload);
    const { data: board } = await db
      .from("mod_feedback_boards")
      .select("id")
      .eq("slug", s.apiBoard)
      .maybeSingle();
    const result = await resolveInboxItem(
      db,
      ctx.user.id,
      input.id,
      input.action,
      input.targetPostId,
      board?.id ?? null,
    );
    return ok(result);
  }),

  "POST /staff/summary": staff(async (req, ctx) => {
    requireAi();
    const input = await parseBody(req, z.object({ postId: z.uuid() }));
    const s = await loadAp(ctx.getPayload);
    if (!s.summaries)
      throw new HttpError(
        400,
        "Comment summaries are off (Settings → Autopilot).",
      );
    const summary = await summarizePost(
      createAdminClient(),
      gatewayAi,
      input.postId,
    );
    return ok({ summary });
  }),

  /** "Draft with AI": a Payload draft announcing the chosen ideas. */
  "POST /staff/changelog/draft": staff(async (req, ctx) => {
    requireAi();
    const input = await parseBody(
      req,
      z.object({ ideaIds: z.array(z.uuid()).min(1).max(10) }),
    );
    const s = await loadAp(ctx.getPayload);
    if (!s.drafts)
      throw new HttpError(
        400,
        "Changelog drafts are off (Settings → Autopilot).",
      );
    const draft = await draftChangelog(ctx.supabase, gatewayAi, input.ideaIds);
    const payload = await ctx.getPayload();
    const body = {
      root: {
        type: "root",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: draft.paragraphs.map((text) => ({
          type: "paragraph",
          version: 1,
          children: [{ type: "text", version: 1, text }],
        })),
      },
    };
    const entry = await payload.create({
      collection: "mod-feedback-changelog",
      draft: true,
      data: {
        title: draft.title,
        excerpt: draft.excerpt,
        body,
        type: "new",
        audience: "everyone",
        notifySubscribers: true,
        linkedIdeas: input.ideaIds,
        _status: "draft",
      } as unknown as RequiredDataFromCollectionSlug<"mod-feedback-changelog">,
      overrideAccess: true,
    });
    return json(201, { id: entry.id, title: draft.title });
  }),

  "GET /staff/api-keys": staff(async (_req, ctx) => {
    const keys = must(
      await ctx.supabase
        .from("mod_feedback_api_keys")
        .select("id, prefix, created_at, revoked_at")
        .order("created_at", { ascending: false })
        .limit(20),
    );
    return ok({ keys });
  }),

  /** New inbound-API key (shown once); revokes the previous ones. */
  "POST /staff/api-keys/rotate": staff(async (_req, ctx) => {
    const key = `fbk_${randomBytes(24).toString("base64url")}`;
    const db = createAdminClient();
    await db
      .from("mod_feedback_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .is("revoked_at", null);
    must(
      await db.from("mod_feedback_api_keys").insert({
        prefix: key.slice(0, 10),
        key_hash: hashKey(key),
        created_by: ctx.user.id,
      }),
    );
    return json(201, { key });
  }),
};

/**
 * Semantic "Similar feedback" for signed-in, non-anonymous members: the
 * query is embedded and matched by meaning, merged with the full-text +
 * trigram matches every visitor gets.
 */
export async function semanticSimilar(
  ctx: {
    supabase: ModRouteContext["supabase"];
    getPayload: () => Promise<BasePayload>;
  },
  q: string,
  board: string | null,
) {
  if (!aiConfigured()) return [];
  const s = await loadAp(ctx.getPayload);
  if (!s.enabled) return [];
  const vector = await gatewayAi.embed(q);
  const { data } = await ctx.supabase.rpc("mod_feedback_similar_by_embedding", {
    _embedding: toVector(vector),
    _board: board ?? undefined,
    _limit: 5,
  });
  return (data ?? []).filter((p) => p.similarity >= 0.75);
}
