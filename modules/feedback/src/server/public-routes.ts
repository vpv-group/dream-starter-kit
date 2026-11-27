import "server-only";

import type { User } from "@supabase/supabase-js";
import { after } from "next/server";

import type {
  ModPublicRouteContext,
  ModPublicRouteTable,
} from "@acme/mod-kit/server";
import { isCronRequest } from "@acme/mod-kit/cron";
import { getModuleSettings } from "@acme/mod-kit/payload";

import type { FeedbackSettings } from "../payload/settings";
import type { AnonRule } from "../shared/config";
import { settings as settingsDef } from "../payload/settings";
import { effectiveAnon } from "../shared/config";
import {
  commentInput,
  createPostInput,
  reactionInput,
  subscribeInput,
  voteInput,
} from "../validators";
import { createAdminClient } from "./admin-client";
import { semanticSimilar } from "./autopilot-routes";
import { ensureConfigSynced, syncAllConfig } from "./full-sync";
import { handle, HttpError, json, must, ok, parseBody } from "./http";
import {
  notifyComment,
  notifyMilestone,
  notifyStaffNewPost,
  reachedMilestone,
} from "./notify";

/**
 * Public module routes (/api/mod/feedback/…). They serve signed-in members
 * AND anonymous visitors: members write through their own RLS client;
 * anonymous users (Supabase anonymous sessions, minted behind Turnstile) are
 * checked against the board's anonymous rule here and then written with the
 * service role — anonymous JWTs can never write the tables directly.
 */

type Kind = "votes" | "posts" | "comments";

export async function loadSettings(
  ctx: Pick<ModPublicRouteContext, "getPayload">,
): Promise<FeedbackSettings> {
  return getModuleSettings<FeedbackSettings>(
    await ctx.getPayload(),
    settingsDef,
  );
}

function requireUser(ctx: ModPublicRouteContext): User {
  if (!ctx.user) {
    throw new HttpError(401, "Sign in to continue.", "auth_required");
  }
  return ctx.user;
}

interface BoardAccess {
  id: string;
  slug: string;
  anon_votes: AnonRule;
  anon_posts: AnonRule;
  anon_comments: AnonRule;
}

/** The board as the CALLER sees it (RLS) — null when they can't read it. */
async function readableBoard(
  ctx: ModPublicRouteContext,
  boardId: string,
): Promise<BoardAccess | null> {
  const { data } = await ctx.supabase
    .from("mod_feedback_boards")
    .select("id, slug, anon_votes, anon_posts, anon_comments")
    .eq("id", boardId)
    .maybeSingle();
  return (data as BoardAccess | null) ?? null;
}

async function readablePostBoard(
  ctx: ModPublicRouteContext,
  postId: string,
): Promise<BoardAccess> {
  const { data } = await ctx.supabase
    .from("mod_feedback_posts")
    .select("board_id")
    .eq("id", postId)
    .maybeSingle();
  if (!data) throw new HttpError(404, "Post not found.");
  const board = await readableBoard(ctx, data.board_id);
  if (!board) throw new HttpError(404, "Post not found.");
  return board;
}

/**
 * The client to write with: the caller's own RLS client for members, the
 * service role for anonymous users whose board allows `kind` (else 401 so
 * the portal shows its sign-in prompt).
 */
function writerFor(
  user: User,
  ctx: ModPublicRouteContext,
  board: BoardAccess,
  kind: Kind,
  s: FeedbackSettings,
) {
  if (!user.is_anonymous) return ctx.supabase;
  const rule = {
    votes: board.anon_votes,
    posts: board.anon_posts,
    comments: board.anon_comments,
  }[kind];
  const global = {
    votes: s.anonVotes ?? true,
    posts: s.anonPosts ?? false,
    comments: s.anonComments ?? false,
  }[kind];
  if (!effectiveAnon(rule, global)) {
    throw new HttpError(401, "Sign in to continue.", "auth_required");
  }
  return createAdminClient();
}

async function rateLimit(
  table: "mod_feedback_posts" | "mod_feedback_comments",
  userId: string,
  perHour: number,
) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await createAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("author_id", userId)
    .gte("created_at", since);
  if ((count ?? 0) >= perHour) {
    throw new HttpError(
      429,
      "You're posting a lot — try again in a bit.",
      "rate_limited",
    );
  }
}

async function isStaff(ctx: ModPublicRouteContext): Promise<boolean> {
  if (!ctx.user || ctx.user.is_anonymous) return false;
  const { data } = await ctx.supabase.rpc("mod_feedback_is_staff");
  return Boolean(data);
}

export const publicRoutes: ModPublicRouteTable = {
  /** Portal configuration for clients (web islands + native). */
  "GET /config": handle(async (_req, ctx) => {
    await ensureConfigSynced(ctx.getPayload);
    const s = await loadSettings(ctx);
    const [boards, statuses, counts, staff] = await Promise.all([
      ctx.supabase
        .from("mod_feedback_boards")
        .select(
          "id, slug, name, description, access, show_on_portal_home, allow_new_posts, anon_votes, anon_posts, anon_comments, show_vote_counts, show_voters, show_dates, form",
        )
        .eq("archived", false)
        .order("position"),
      ctx.supabase
        .from("mod_feedback_statuses")
        .select(
          "id, name, type, tone, position, show_on_roadmap, is_default, notify_by_default",
        )
        .eq("archived", false)
        .order("position"),
      ctx.supabase.rpc("mod_feedback_board_counts"),
      isStaff(ctx),
    ]);
    const countBy = new Map(
      (counts.data ?? []).map((c) => [c.board_id, Number(c.post_count)]),
    );
    return ok({
      title: s.portalTitle ?? "Feedback",
      intro: s.feedbackIntro ?? null,
      tabs: s.portalTabs.filter((t) => t.enabled !== false),
      anon: {
        votes: s.anonVotes ?? true,
        posts: s.anonPosts ?? false,
        comments: s.anonComments ?? false,
      },
      boards: (boards.data ?? []).map((b) => ({
        ...b,
        post_count: countBy.get(b.id) ?? 0,
      })),
      statuses: statuses.data ?? [],
      viewer: ctx.user
        ? { id: ctx.user.id, anonymous: Boolean(ctx.user.is_anonymous), staff }
        : null,
    });
  }),

  /** "Similar feedback" while typing, and portal search (full-text + trigram). */
  "GET /similar": handle(async (req, ctx) => {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").slice(0, 200);
    const board = url.searchParams.get("board");
    const limit = Number(url.searchParams.get("limit") ?? 5);
    if (q.trim().length < 3) return ok({ posts: [] });
    const posts = must(
      await ctx.supabase.rpc("mod_feedback_similar_posts", {
        _q: q,
        _board: board ?? undefined,
        _limit: Number.isFinite(limit) ? limit : 5,
      }),
    );
    // Members (signed in, not anonymous) also get matches by meaning.
    if (ctx.user && !ctx.user.is_anonymous) {
      const semantic = await semanticSimilar(ctx, q, board).catch(() => []);
      const seen = new Set(posts.map((p) => p.id));
      for (const p of semantic) {
        if (!seen.has(p.id)) posts.push({ ...p, score: p.similarity });
      }
    }
    return ok({ posts });
  }),

  "POST /vote": handle(async (req, ctx) => {
    const user = requireUser(ctx);
    const input = await parseBody(req, voteInput);
    const s = await loadSettings(ctx);
    const board = await readablePostBoard(ctx, input.postId);
    const db = writerFor(user, ctx, board, "votes", s);
    if (input.voted) {
      const { error } = await db
        .from("mod_feedback_votes")
        .insert({ post_id: input.postId, user_id: user.id });
      // Already voted: idempotent.
      if (error && error.code !== "23505") throw error;
    } else {
      must(
        await db
          .from("mod_feedback_votes")
          .delete()
          .eq("post_id", input.postId)
          .eq("user_id", user.id),
      );
    }
    const { data: post } = await createAdminClient()
      .from("mod_feedback_posts")
      .select("vote_count")
      .eq("id", input.postId)
      .maybeSingle();
    const votes = post?.vote_count ?? 0;
    if (input.voted) {
      const milestone = reachedMilestone(votes, s.voteMilestones ?? []);
      if (milestone) {
        after(() =>
          notifyMilestone(createAdminClient(), {
            postId: input.postId,
            votes: milestone,
          }).catch((e) => console.error("[feedback] milestone notify", e)),
        );
      }
    }
    return ok({ voted: input.voted, votes });
  }),

  "POST /posts": handle(async (req, ctx) => {
    const user = requireUser(ctx);
    const input = await parseBody(req, createPostInput);
    const s = await loadSettings(ctx);
    const board = await readableBoard(ctx, input.boardId);
    if (!board) throw new HttpError(404, "Board not found.");
    const db = writerFor(user, ctx, board, "posts", s);
    await rateLimit("mod_feedback_posts", user.id, s.postsPerHour ?? 10);

    const { data: full } = await createAdminClient()
      .from("mod_feedback_boards")
      .select("form, allow_new_posts")
      .eq("id", board.id)
      .single();
    const form = (full?.form ?? {}) as {
      customFields?: { key: string; label: string; required: boolean }[];
      allowAttachments?: boolean;
    };
    for (const f of form.customFields ?? []) {
      if (f.required && !input.customFields[f.key]?.trim()) {
        throw new HttpError(400, `${f.label} is required.`, "invalid_body");
      }
    }
    if (input.categoryId) {
      const { data: cat } = await ctx.supabase
        .from("mod_feedback_categories")
        .select("id")
        .eq("id", input.categoryId)
        .eq("board_id", board.id)
        .eq("archived", false)
        .maybeSingle();
      if (!cat) throw new HttpError(400, "Unknown category.");
    }
    const post = must(
      await db
        .from("mod_feedback_posts")
        .insert({
          board_id: board.id,
          author_id: user.id,
          title: input.title,
          details: input.details,
          category_id: input.categoryId ?? null,
          custom_fields: input.customFields,
          attachments: form.allowAttachments === false ? [] : input.attachments,
          // Placeholder; the insert trigger sets the real slug.
          slug: "pending",
        })
        .select("id, slug, approval_state")
        .single(),
    );
    if (s.notifyStaffOnNewPost !== false) {
      after(() =>
        notifyStaffNewPost(createAdminClient(), {
          postId: post.id,
          authorId: user.id,
        }).catch((e) => console.error("[feedback] new-post notify", e)),
      );
    }
    return json(201, {
      id: post.id,
      slug: post.slug,
      boardSlug: board.slug,
      approvalState: post.approval_state,
    });
  }),

  "POST /comments": handle(async (req, ctx) => {
    const user = requireUser(ctx);
    const input = await parseBody(req, commentInput);
    const s = await loadSettings(ctx);
    const board = await readablePostBoard(ctx, input.postId);
    const staff = await isStaff(ctx);
    const db = writerFor(user, ctx, board, "comments", s);
    if (!staff) {
      await rateLimit(
        "mod_feedback_comments",
        user.id,
        s.commentsPerHour ?? 30,
      );
    }
    let parentAuthorId: string | null = null;
    if (input.parentId) {
      const { data: parent } = await ctx.supabase
        .from("mod_feedback_comments")
        .select("author_id, parent_id")
        .eq("id", input.parentId)
        .eq("post_id", input.postId)
        .maybeSingle();
      if (!parent) throw new HttpError(400, "That comment is gone.");
      parentAuthorId = parent.author_id;
      // One level of replies, as in Canny: answer the thread's root.
      if (parent.parent_id) input.parentId = parent.parent_id;
    }
    const comment = must(
      await db
        .from("mod_feedback_comments")
        .insert({
          post_id: input.postId,
          author_id: user.id,
          body: input.body,
          parent_id: input.parentId ?? null,
          is_internal: staff && input.internal,
        })
        .select("id, created_at")
        .single(),
    );
    if (!(staff && input.internal)) {
      after(() =>
        notifyComment(createAdminClient(), {
          postId: input.postId,
          commentId: comment.id,
          authorId: user.id,
          authorIsStaff: staff,
          parentAuthorId,
          body: input.body,
          notifyFollowers: s.notifyVotersOnStaffComment !== false,
        }).catch((e) => console.error("[feedback] comment notify", e)),
      );
    }
    return json(201, comment);
  }),

  "POST /reactions": handle(async (req, ctx) => {
    const user = requireUser(ctx);
    const input = await parseBody(req, reactionInput);
    const s = await loadSettings(ctx);
    // A like on a comment / status change follows the board's vote rule.
    const table =
      input.targetType === "comment"
        ? "mod_feedback_comments"
        : "mod_feedback_status_changes";
    const { data: target } = await ctx.supabase
      .from(table)
      .select("post_id")
      .eq("id", input.targetId)
      .maybeSingle();
    if (!target) throw new HttpError(404, "Not found.");
    const board = await readablePostBoard(ctx, target.post_id);
    const db = writerFor(user, ctx, board, "votes", s);
    if (input.liked) {
      const { error } = await db.from("mod_feedback_reactions").insert({
        target_type: input.targetType,
        target_id: input.targetId,
        user_id: user.id,
      });
      if (error && error.code !== "23505") throw error;
    } else {
      must(
        await db
          .from("mod_feedback_reactions")
          .delete()
          .eq("target_type", input.targetType)
          .eq("target_id", input.targetId)
          .eq("user_id", user.id),
      );
    }
    return ok({ liked: input.liked });
  }),

  /** Follow / unfollow a post (signed-in members; anonymous users have no inbox). */
  "POST /subscribe": handle(async (req, ctx) => {
    const user = requireUser(ctx);
    if (user.is_anonymous) {
      throw new HttpError(401, "Sign in to follow posts.", "auth_required");
    }
    const input = await parseBody(req, subscribeInput);
    await readablePostBoard(ctx, input.postId);
    if (input.subscribed) {
      const { error } = await ctx.supabase
        .from("mod_feedback_subscriptions")
        .insert({
          post_id: input.postId,
          user_id: user.id,
          reason: "manual",
        });
      if (error && error.code !== "23505") throw error;
    } else {
      must(
        await ctx.supabase
          .from("mod_feedback_subscriptions")
          .delete()
          .eq("post_id", input.postId)
          .eq("user_id", user.id),
      );
    }
    return ok({ subscribed: input.subscribed });
  }),

  /** Hourly: re-copy Payload config into Supabase (Supabase Cron). */
  "GET /cron/config-sync": handle(async (req, ctx) => {
    if (!isCronRequest(req)) return json(401, { error: "Unauthorized" });
    const result = await syncAllConfig(await ctx.getPayload());
    return ok(result);
  }),
};
