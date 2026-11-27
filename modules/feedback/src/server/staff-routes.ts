import "server-only";

import { after } from "next/server";

import type { TablesUpdate } from "@acme/api";
import type { ModRouteTable } from "@acme/mod-kit/server";

import {
  commentUpdateInput,
  listQuery,
  mergeInput,
  postUpdateInput,
  statusInput,
  voteOnBehalfInput,
} from "../validators";
import { createAdminClient } from "./admin-client";
import { syncAllConfig } from "./full-sync";
import { HttpError, must, ok, parseBody, staff } from "./http";
import { notifyAssigned, notifyStatusChange } from "./notify";

/**
 * Staff routes (/api/mod/feedback/staff/…): authed by the dispatcher
 * (anonymous sessions get 401), then gated on staff here. Writes run as the
 * staff member through RLS + the module's staff-checked SQL functions, so
 * Postgres stays the authority (golden rule #1); the service role is used
 * only to notify other users.
 */

const POST_LIST_COLUMNS =
  "id, board_id, category_id, status_id, author_id, owner_id, title, details, slug, vote_count, comment_count, trend_score, trend_at, approval_state, pinned, merged_into_id, eta, eta_public, source, status_changed_at, created_at, deleted_at";

export const staffRoutes: ModRouteTable = {
  /** Change status (Canny's status dialog): message + "Notify N voters". */
  "POST /staff/status": staff(async (req, ctx) => {
    const input = await parseBody(req, statusInput);
    const changeId = must(
      await ctx.supabase.rpc("mod_feedback_set_status", {
        _post: input.postId,
        _status: input.statusId,
        _message: input.message ?? undefined,
        _notify: input.notify,
        _origin: "user",
      }),
    );
    if (changeId && input.notify) {
      const { data: status } = await ctx.supabase
        .from("mod_feedback_statuses")
        .select("name")
        .eq("id", input.statusId)
        .single();
      after(() =>
        notifyStatusChange(createAdminClient(), {
          postId: input.postId,
          changeId,
          statusName: status?.name ?? input.statusId,
          message: input.message,
          actorId: ctx.user.id,
        }).catch((e) => console.error("[feedback] status notify", e)),
      );
    }
    return ok({ changeId });
  }),

  /** Edit a post's staff fields (owner, category, ETA, pin, approval, tags…). */
  "POST /staff/update": staff(async (req, ctx) => {
    const input = await parseBody(req, postUpdateInput);
    const patch: TablesUpdate<"mod_feedback_posts"> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.details !== undefined) patch.details = input.details;
    if (input.boardId !== undefined) patch.board_id = input.boardId;
    if (input.categoryId !== undefined) patch.category_id = input.categoryId;
    if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
    if (input.eta !== undefined) {
      patch.eta = input.eta?.length === 7 ? `${input.eta}-01` : input.eta;
    }
    if (input.etaPublic !== undefined) patch.eta_public = input.etaPublic;
    if (input.pinned !== undefined) patch.pinned = input.pinned;
    if (input.approvalState !== undefined)
      patch.approval_state = input.approvalState;
    if (input.deleted !== undefined) {
      patch.deleted_at = input.deleted ? new Date().toISOString() : null;
    }
    const { data: before } = await ctx.supabase
      .from("mod_feedback_posts")
      .select("owner_id")
      .eq("id", input.postId)
      .maybeSingle();
    if (!before) throw new HttpError(404, "Post not found.");
    if (Object.keys(patch).length) {
      must(
        await ctx.supabase
          .from("mod_feedback_posts")
          .update(patch)
          .eq("id", input.postId),
      );
    }
    if (input.tagIds) {
      must(
        await ctx.supabase
          .from("mod_feedback_post_tags")
          .delete()
          .eq("post_id", input.postId),
      );
      if (input.tagIds.length) {
        must(
          await ctx.supabase
            .from("mod_feedback_post_tags")
            .insert(
              input.tagIds.map((tag_id) => ({ post_id: input.postId, tag_id })),
            ),
        );
      }
    }
    if (input.ownerId && input.ownerId !== before.owner_id) {
      const ownerId = input.ownerId;
      after(() =>
        notifyAssigned(createAdminClient(), {
          postId: input.postId,
          ownerId,
          actorId: ctx.user.id,
        }).catch((e) => console.error("[feedback] assign notify", e)),
      );
    }
    return ok();
  }),

  "POST /staff/merge": staff(async (req, ctx) => {
    const input = await parseBody(req, mergeInput);
    const activityId = must(
      await ctx.supabase.rpc("mod_feedback_merge_posts", {
        _source: input.sourceId,
        _target: input.targetId,
      }),
    );
    return ok({ activityId });
  }),

  "POST /staff/unmerge": staff(async (req, ctx) => {
    const input = await parseBody(req, mergeInput.pick({ sourceId: true }));
    must(
      await ctx.supabase.rpc("mod_feedback_unmerge_post", {
        _source: input.sourceId,
      }),
    );
    return ok();
  }),

  /** Canny's "Add voter": vote on a user's behalf, with a priority. */
  "POST /staff/vote": staff(async (req, ctx) => {
    const input = await parseBody(req, voteOnBehalfInput);
    if (input.remove) {
      must(
        await ctx.supabase
          .from("mod_feedback_votes")
          .delete()
          .eq("post_id", input.postId)
          .eq("user_id", input.userId),
      );
      return ok();
    }
    must(
      await ctx.supabase.from("mod_feedback_votes").upsert(
        {
          post_id: input.postId,
          user_id: input.userId,
          priority: input.priority ?? null,
          created_by: ctx.user.id,
        },
        { onConflict: "post_id,user_id" },
      ),
    );
    return ok();
  }),

  "POST /staff/comment": staff(async (req, ctx) => {
    const input = await parseBody(req, commentUpdateInput);
    const patch: TablesUpdate<"mod_feedback_comments"> = {};
    if (input.body !== undefined) patch.body = input.body;
    if (input.pinned !== undefined) patch.pinned = input.pinned;
    if (input.deleted !== undefined) {
      patch.deleted_at = input.deleted ? new Date().toISOString() : null;
    }
    must(
      await ctx.supabase
        .from("mod_feedback_comments")
        .update(patch)
        .eq("id", input.commentId),
    );
    return ok();
  }),

  /** All voters of a post (staff see everyone, with priority). */
  "GET /staff/voters": staff(async (req, ctx) => {
    const postId = new URL(req.url).searchParams.get("post");
    if (!postId) throw new HttpError(400, "post is required");
    const voters = must(
      await ctx.supabase.rpc("mod_feedback_post_voters", {
        _post: postId,
        _limit: 500,
      }),
    );
    return ok({ voters });
  }),

  /** People search for "Add voter" and Owner pickers. */
  "GET /staff/people": staff(async (req) => {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    const admin = createAdminClient();
    let query = admin
      .from("profiles")
      .select("id, display_name, avatar_url, is_staff")
      .eq("is_anonymous", false)
      .order("display_name")
      .limit(20);
    if (new URL(req.url).searchParams.get("staff") === "1") {
      query = query.eq("is_staff", true);
    }
    if (q) query = query.ilike("display_name", `%${q.replace(/[%_]/g, "")}%`);
    const people = must(await query);
    return ok({ people });
  }),

  /** The staff Posts table (/a/feedback → Posts), with filters + paging. */
  "GET /staff/posts": staff(async (req, ctx) => {
    const url = new URL(req.url);
    const query = listQuery.parse({
      board: url.searchParams.get("board") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      status: url.searchParams.getAll("status"),
      q: url.searchParams.get("q") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
    });
    const pageSize = 50;
    let q = ctx.supabase
      .from("mod_feedback_posts")
      .select(POST_LIST_COLUMNS, { count: "exact" })
      .is("deleted_at", null)
      .is("merged_into_id", null);
    if (query.board) q = q.eq("board_id", query.board);
    if (query.status.length) q = q.in("status_id", query.status);
    if (query.q)
      q = q.textSearch("search", query.q, {
        type: "websearch",
        config: "english",
      });
    q =
      query.sort === "new"
        ? q.order("created_at", { ascending: false })
        : query.sort === "top"
          ? q.order("vote_count", { ascending: false })
          : q.order("trend_score", { ascending: false });
    const res = await q.range(
      query.page * pageSize,
      query.page * pageSize + pageSize - 1,
    );
    return ok({ posts: must(res), total: res.count ?? 0, pageSize });
  }),

  /** Inbox: posts awaiting approval + posts stale in an active status. */
  "GET /staff/inbox": staff(async (_req, ctx) => {
    const pending = must(
      await ctx.supabase
        .from("mod_feedback_posts")
        .select(POST_LIST_COLUMNS)
        .eq("approval_state", "pending")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(100),
    );
    const { getModuleSettings } = await import("@acme/mod-kit/payload");
    const { settings } = await import("../payload/settings");
    const s = await getModuleSettings<{ staleAfterWeeks?: number | null }>(
      await ctx.getPayload(),
      settings,
    );
    const weeks = s.staleAfterWeeks ?? 4;
    const cutoff = new Date(Date.now() - weeks * 7 * 86400_000).toISOString();
    const { data: active } = await ctx.supabase
      .from("mod_feedback_statuses")
      .select("id")
      .eq("type", "active");
    const stale = active?.length
      ? must(
          await ctx.supabase
            .from("mod_feedback_posts")
            .select(POST_LIST_COLUMNS)
            .in(
              "status_id",
              active.map((a) => a.id),
            )
            .lt("status_changed_at", cutoff)
            .is("deleted_at", null)
            .is("merged_into_id", null)
            .order("status_changed_at", { ascending: true })
            .limit(50),
        )
      : [];
    const recent = must(
      await ctx.supabase
        .from("mod_feedback_posts")
        .select(POST_LIST_COLUMNS)
        .eq("approval_state", "approved")
        .is("deleted_at", null)
        .is("merged_into_id", null)
        .order("created_at", { ascending: false })
        .limit(25),
    );
    return ok({ pending, stale, recent, staleAfterWeeks: weeks });
  }),

  /** Re-copy config from Payload now (the "Resync" button). */
  "POST /staff/resync": staff(async (_req, ctx) => {
    const result = await syncAllConfig(await ctx.getPayload());
    return ok(result);
  }),
};
