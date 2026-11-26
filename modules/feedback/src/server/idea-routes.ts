import "server-only";

import { after } from "next/server";

import type { TablesUpdate } from "@acme/api";
import type { ModRouteContext, ModRouteTable } from "@acme/mod-kit/server";
import { getModuleSettings } from "@acme/mod-kit/payload";

import type { FeedbackSettings } from "../payload/settings";
import { settings as settingsDef } from "../payload/settings";
import { DEFAULT_SCORE_FACTORS } from "../shared/score";
import {
  ideaCreateInput,
  ideaStageInput,
  ideaUpdateInput,
  linkPostInput,
} from "../validators";
import { createAdminClient } from "./admin-client";
import { handle, HttpError, json, must, ok, parseBody } from "./http";
import { notifyStatusChange } from "./notify";

/**
 * Ideas — the internal roadmap (staff only; RLS + staff-checked SQL).
 * Moving an idea's stage cascades the mapped status to every linked post in
 * one transaction (mod_feedback_set_idea_stage); voters of those posts are
 * notified when the stage says so.
 */

async function requireStaff(ctx: ModRouteContext): Promise<void> {
  const { data } = await ctx.supabase.rpc("mod_feedback_is_staff");
  if (!data) throw new HttpError(403, "Staff only.", "forbidden");
}

const staff = (fn: (req: Request, ctx: ModRouteContext) => Promise<Response>) =>
  handle(async (req: Request, ctx: ModRouteContext) => {
    await requireStaff(ctx);
    return fn(req, ctx);
  });

/** Notify voters for every status change a stage cascade made. */
export function notifyCascade(
  changes: { change_id: string; post_id: string; notified: boolean }[],
  statusName: string,
  message: string | null | undefined,
  actorId: string | null,
) {
  const toNotify = changes.filter((c) => c.notified);
  if (!toNotify.length) return;
  after(async () => {
    const db = createAdminClient();
    for (const c of toNotify) {
      await notifyStatusChange(db, {
        postId: c.post_id,
        changeId: c.change_id,
        statusName,
        message,
        actorId,
      }).catch((e: unknown) => console.error("[feedback] cascade notify", e));
    }
  });
}

export const ideaRoutes: ModRouteTable = {
  /** Ideas table + kanban data: ideas, stages, score factors, voter stats. */
  "GET /staff/ideas": staff(async (req, ctx) => {
    const includeArchived =
      new URL(req.url).searchParams.get("archived") === "1";
    let q = ctx.supabase
      .from("mod_feedback_ideas")
      .select("*")
      .order("stage_changed_at", { ascending: false })
      .limit(500);
    if (!includeArchived) q = q.eq("archived", false);
    const ideas = must(await q);
    const [stages, s, stats, links] = await Promise.all([
      ctx.supabase
        .from("mod_feedback_idea_stages")
        .select("*")
        .eq("archived", false)
        .order("position"),
      getModuleSettings<FeedbackSettings>(await ctx.getPayload(), settingsDef),
      ideas.length
        ? ctx.supabase.rpc("mod_feedback_idea_voter_stats", {
            _ideas: ideas.map((i) => i.id),
          })
        : Promise.resolve({ data: [] }),
      ideas.length
        ? ctx.supabase
            .from("mod_feedback_posts")
            .select("idea_id")
            .in(
              "idea_id",
              ideas.map((i) => i.id),
            )
            .is("deleted_at", null)
        : Promise.resolve({ data: [] as { idea_id: string | null }[] }),
    ]);
    const linked = new Map<string, number>();
    for (const l of links.data ?? []) {
      if (l.idea_id) linked.set(l.idea_id, (linked.get(l.idea_id) ?? 0) + 1);
    }
    return ok({
      ideas: ideas.map((i) => ({ ...i, linked_posts: linked.get(i.id) ?? 0 })),
      stages: stages.data ?? [],
      factors: s.scoreFactors.length ? s.scoreFactors : DEFAULT_SCORE_FACTORS,
      stats: stats.data ?? [],
    });
  }),

  /** One idea with its linked posts (the record sheet). */
  "GET /staff/idea": staff(async (req, ctx) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "id is required");
    const idea = must(
      await ctx.supabase
        .from("mod_feedback_ideas")
        .select("*")
        .eq("id", id)
        .maybeSingle(),
    );
    const posts = must(
      await ctx.supabase
        .from("mod_feedback_posts")
        .select(
          "id, title, slug, board_id, status_id, vote_count, comment_count",
        )
        .eq("idea_id", id)
        .is("deleted_at", null)
        .order("vote_count", { ascending: false }),
    );
    return ok({ idea, posts });
  }),

  "POST /staff/ideas": staff(async (req, ctx) => {
    const input = await parseBody(req, ideaCreateInput);
    const s = await getModuleSettings<FeedbackSettings>(
      await ctx.getPayload(),
      settingsDef,
    );
    const idea = must(
      await ctx.supabase
        .from("mod_feedback_ideas")
        .insert({
          title: input.title,
          description: input.description,
          stage_id: input.stageId ?? null,
          created_by: ctx.user.id,
          eta_public: s.etaPublicByDefault ?? false,
        })
        .select("*")
        .single(),
    );
    if (input.fromPostId) {
      must(
        await ctx.supabase.rpc("mod_feedback_link_post", {
          _post: input.fromPostId,
          _idea: idea.id,
        }),
      );
    }
    return json(201, { idea });
  }),

  "POST /staff/ideas/update": staff(async (req, ctx) => {
    const input = await parseBody(req, ideaUpdateInput);
    const patch: TablesUpdate<"mod_feedback_ideas"> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
    if (input.eta !== undefined) {
      patch.eta = input.eta?.length === 7 ? `${input.eta}-01` : input.eta;
    }
    if (input.etaPublic !== undefined) patch.eta_public = input.etaPublic;
    if (input.syncLocked !== undefined) patch.sync_locked = input.syncLocked;
    if (input.archived !== undefined) patch.archived = input.archived;
    if (input.factorValues !== undefined) {
      const { data: current } = await ctx.supabase
        .from("mod_feedback_ideas")
        .select("factor_values")
        .eq("id", input.ideaId)
        .maybeSingle();
      patch.factor_values = {
        ...((current?.factor_values ?? {}) as Record<string, unknown>),
        ...input.factorValues,
      } as TablesUpdate<"mod_feedback_ideas">["factor_values"];
    }
    must(
      await ctx.supabase
        .from("mod_feedback_ideas")
        .update(patch)
        .eq("id", input.ideaId),
    );
    return ok();
  }),

  /** Move an idea (kanban drop / stage select) → cascade + notify voters. */
  "POST /staff/ideas/stage": staff(async (req, ctx) => {
    const input = await parseBody(req, ideaStageInput);
    const changes = must(
      await ctx.supabase.rpc("mod_feedback_set_idea_stage", {
        _idea: input.ideaId,
        _stage: input.stageId,
        _message: input.message ?? undefined,
        _notify: input.notify,
      }),
    );
    if (changes.length) {
      const { data: stage } = await ctx.supabase
        .from("mod_feedback_idea_stages")
        .select("portal_status_id")
        .eq("id", input.stageId)
        .single();
      const { data: status } = stage?.portal_status_id
        ? await ctx.supabase
            .from("mod_feedback_statuses")
            .select("name")
            .eq("id", stage.portal_status_id)
            .single()
        : { data: null };
      notifyCascade(
        changes,
        status?.name ?? input.stageId,
        input.message,
        ctx.user.id,
      );
    }
    return ok({
      moved: changes.length,
      notified: changes.filter((c) => c.notified).length,
    });
  }),

  /** Link a post to an idea (or unlink with ideaId null). */
  "POST /staff/link": staff(async (req, ctx) => {
    const input = await parseBody(req, linkPostInput);
    // Omitting _idea (default null) unlinks the post.
    must(
      await ctx.supabase.rpc(
        "mod_feedback_link_post",
        input.ideaId
          ? { _post: input.postId, _idea: input.ideaId }
          : { _post: input.postId },
      ),
    );
    return ok();
  }),
};
