import "server-only";

import type { RequiredDataFromCollectionSlug } from "payload";
import { z } from "zod/v4";

import type { ModMcpContext, ModMcpExtension } from "@acme/mod-kit/server";
import { getModuleSettings } from "@acme/mod-kit/payload";
import { defineMcpTool } from "@acme/mod-kit/server";

import type { FeedbackSettings } from "../payload/settings";
import type { Insights } from "../shared/insights";
import { settings as settingsDef } from "../payload/settings";
import { resolveInboxItem } from "./autopilot";
import { notifyCascade } from "./idea-routes";
import { notifyComment, notifyStatusChange } from "./notify";

/**
 * Feedback tools for the remote MCP server (/mcp). The caller is CMS staff
 * (checked by the route); feedback data lives under RLS with no user
 * session here, so every tool first checks `profiles.is_staff` for the
 * caller, then works with the service-role client and attributes changes
 * to the caller (`_actor`, `author_id`, `created_by`) — the same checks,
 * cascades and notifications as /a/feedback.
 */

async function requireStaff(ctx: ModMcpContext): Promise<void> {
  const { data } = await ctx.admin
    .from("profiles")
    .select("is_staff")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (!data?.is_staff) {
    throw new Error(
      "Feedback tools are for feedback staff (profiles.is_staff).",
    );
  }
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function boardSlugs(ctx: ModMcpContext) {
  const { data } = await ctx.admin
    .from("mod_feedback_boards")
    .select("id, slug, name");
  return new Map((data ?? []).map((b) => [b.id, b]));
}

/** Accept a status/stage id or its (case-insensitive) name. */
async function resolveKey(
  ctx: ModMcpContext,
  table: "mod_feedback_statuses" | "mod_feedback_idea_stages",
  value: string,
): Promise<{ id: string; name: string }> {
  const { data } = await ctx.admin
    .from(table)
    .select("id, name")
    .eq("archived", false);
  const hit = (data ?? []).find(
    (r) => r.id === value || r.name.toLowerCase() === value.toLowerCase(),
  );
  if (!hit) {
    const options = (data ?? []).map((r) => `${r.name} (${r.id})`).join(", ");
    throw new Error(
      `Unknown ${table.endsWith("statuses") ? "status" : "stage"} "${value}". Options: ${options}`,
    );
  }
  return hit;
}

/** Plain paragraphs → a Lexical document for the changelog body. */
function lexicalFromText(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: paragraphs.map((p) => ({
        type: "paragraph",
        version: 1,
        children: [{ type: "text", version: 1, text: p.replace(/\n/g, " ") }],
      })),
    },
  };
}

const tools = [
  defineMcpTool({
    name: "feedback_search_posts",
    title: "Search feedback posts",
    description:
      "Find posts on the feedback portal by text, board or status. Returns ids, titles, votes, comments, status and links. Use feedback_get_post for the full thread.",
    readOnly: true,
    inputSchema: {
      query: z.string().optional().describe("Words in the title or details."),
      board: z.string().optional().describe("Board slug."),
      status: z.string().optional().describe("Status id or name."),
      sort: z.enum(["top", "new", "trending"]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    run: async (args, ctx) => {
      await requireStaff(ctx);
      const boards = await boardSlugs(ctx);
      let q = ctx.admin
        .from("mod_feedback_posts")
        .select(
          "id, board_id, title, slug, status_id, vote_count, comment_count, approval_state, created_at, idea_id",
        )
        .is("deleted_at", null)
        .is("merged_into_id", null);
      if (args.query?.trim()) {
        const term = args.query.trim().replace(/[%,()]/g, " ");
        q = q.or(`title.ilike.%${term}%,details.ilike.%${term}%`);
      }
      if (args.board) {
        const b = [...boards.values()].find((x) => x.slug === args.board);
        if (!b) throw new Error(`Unknown board "${args.board}".`);
        q = q.eq("board_id", b.id);
      }
      if (args.status) {
        q = q.eq(
          "status_id",
          (await resolveKey(ctx, "mod_feedback_statuses", args.status)).id,
        );
      }
      const order =
        args.sort === "new"
          ? "created_at"
          : args.sort === "trending"
            ? "trend_score"
            : "vote_count";
      const { data, error } = await q
        .order(order, { ascending: false })
        .limit(args.limit ?? 20);
      fail(error);
      return {
        posts: (data ?? []).map((p) => {
          const b = boards.get(p.board_id);
          return {
            ...p,
            board: b?.name,
            url: `${ctx.origin}/feedback/${b?.slug ?? ""}/p/${p.slug}`,
          };
        }),
      };
    },
  }),

  defineMcpTool({
    name: "feedback_get_post",
    title: "Read a feedback post",
    description:
      "A post with its details, voter count, status history and comments (internal staff notes are marked).",
    readOnly: true,
    inputSchema: { postId: z.string().uuid() },
    run: async ({ postId }, ctx) => {
      await requireStaff(ctx);
      const { data: post, error } = await ctx.admin
        .from("mod_feedback_posts")
        .select("*")
        .eq("id", postId)
        .maybeSingle();
      fail(error);
      if (!post) throw new Error("Post not found.");
      const [comments, changes, idea, boards] = await Promise.all([
        ctx.admin
          .from("mod_feedback_comments")
          .select("id, author_id, body, is_internal, parent_id, created_at")
          .eq("post_id", postId)
          .is("deleted_at", null)
          .order("created_at"),
        ctx.admin
          .from("mod_feedback_status_changes")
          .select("from_status_id, to_status_id, message, origin, created_at")
          .eq("post_id", postId)
          .order("created_at"),
        post.idea_id
          ? ctx.admin
              .from("mod_feedback_ideas")
              .select("id, title, stage_id")
              .eq("id", post.idea_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        boardSlugs(ctx),
      ]);
      const b = boards.get(post.board_id);
      return {
        post: {
          id: post.id,
          title: post.title,
          details: post.details,
          board: b?.name,
          status: post.status_id,
          votes: post.vote_count,
          approval: post.approval_state,
          source: post.source,
          createdAt: post.created_at,
          url: `${ctx.origin}/feedback/${b?.slug ?? ""}/p/${post.slug}`,
        },
        idea: idea.data,
        statusHistory: changes.data ?? [],
        comments: comments.data ?? [],
      };
    },
  }),

  defineMcpTool({
    name: "feedback_set_status",
    title: "Change a post's status",
    description:
      "Move a post to a status (id or name), optionally with a message, and tell its voters. Posts linked to a roadmap idea follow the idea: change the idea's stage instead.",
    inputSchema: {
      postId: z.string().uuid(),
      status: z.string().describe("Status id or name, e.g. Planned."),
      message: z.string().max(2000).optional(),
      notifyVoters: z.boolean().optional().describe("Default true."),
    },
    run: async (args, ctx) => {
      await requireStaff(ctx);
      const status = await resolveKey(
        ctx,
        "mod_feedback_statuses",
        args.status,
      );
      const notify = args.notifyVoters ?? true;
      const { data: changeId, error } = await ctx.admin.rpc(
        "mod_feedback_set_status",
        {
          _post: args.postId,
          _status: status.id,
          _message: args.message,
          _notify: notify,
          _origin: "user",
          _actor: ctx.userId,
        },
      );
      fail(error);
      let notified = 0;
      if (changeId && notify) {
        notified = await notifyStatusChange(ctx.admin, {
          postId: args.postId,
          changeId,
          statusName: status.name,
          message: args.message,
          actorId: ctx.userId,
        });
      }
      return { changed: Boolean(changeId), status: status.name, notified };
    },
  }),

  defineMcpTool({
    name: "feedback_comment",
    title: "Comment on a post",
    description:
      "Add a comment as you. internal: true makes it a staff-only note. Public staff comments notify the post's followers (Settings → Notifications).",
    inputSchema: {
      postId: z.string().uuid(),
      body: z.string().trim().min(1).max(10000),
      internal: z.boolean().optional(),
    },
    run: async (args, ctx) => {
      await requireStaff(ctx);
      const { data, error } = await ctx.admin
        .from("mod_feedback_comments")
        .insert({
          post_id: args.postId,
          author_id: ctx.userId,
          body: args.body,
          is_internal: args.internal ?? false,
        })
        .select("id")
        .single();
      fail(error);
      if (!args.internal && data) {
        const s = await getModuleSettings<FeedbackSettings>(
          ctx.payload,
          settingsDef,
        );
        await notifyComment(ctx.admin, {
          postId: args.postId,
          commentId: data.id,
          authorId: ctx.userId,
          authorIsStaff: true,
          body: args.body,
          notifyFollowers: s.notifyVotersOnStaffComment !== false,
        });
      }
      return { commentId: data?.id };
    },
  }),

  defineMcpTool({
    name: "feedback_list_ideas",
    title: "List roadmap ideas",
    description:
      "Internal roadmap ideas with stage, vote total (from linked posts) and score. Filter by stage id or name.",
    readOnly: true,
    inputSchema: {
      stage: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    run: async (args, ctx) => {
      await requireStaff(ctx);
      let q = ctx.admin
        .from("mod_feedback_ideas")
        .select(
          "id, title, stage_id, vote_total, score, eta, owner_id, updated_at",
        )
        .eq("archived", false);
      if (args.stage) {
        q = q.eq(
          "stage_id",
          (await resolveKey(ctx, "mod_feedback_idea_stages", args.stage)).id,
        );
      }
      const { data, error } = await q
        .order("vote_total", { ascending: false })
        .limit(args.limit ?? 30);
      fail(error);
      return { ideas: data ?? [] };
    },
  }),

  defineMcpTool({
    name: "feedback_create_idea",
    title: "Create a roadmap idea",
    description:
      "Create an idea (starts in the first stage) and optionally link posts to it. Linked posts' statuses then follow the idea's stage.",
    inputSchema: {
      title: z.string().trim().min(1).max(400),
      description: z.string().max(20000).optional(),
      postIds: z.array(z.string().uuid()).max(50).optional(),
    },
    run: async (args, ctx) => {
      await requireStaff(ctx);
      const { data: idea, error } = await ctx.admin
        .from("mod_feedback_ideas")
        .insert({
          title: args.title,
          description: args.description ?? "",
          created_by: ctx.userId,
        })
        .select("id, stage_id")
        .single();
      fail(error);
      const linked: string[] = [];
      for (const post of args.postIds ?? []) {
        const res = await ctx.admin.rpc("mod_feedback_link_post", {
          _post: post,
          _idea: idea?.id,
        });
        if (!res.error) linked.push(post);
      }
      return { ideaId: idea?.id, stage: idea?.stage_id, linked };
    },
  }),

  defineMcpTool({
    name: "feedback_set_idea_stage",
    title: "Move a roadmap idea",
    description:
      "Move an idea to a stage (id or name). Its linked posts move to the stage's portal status in the same step, and their voters are told when the stage says so.",
    inputSchema: {
      ideaId: z.string().uuid(),
      stage: z.string(),
      message: z.string().max(2000).optional(),
      notifyVoters: z.boolean().optional().describe("Default true."),
    },
    run: async (args, ctx) => {
      await requireStaff(ctx);
      const stage = await resolveKey(
        ctx,
        "mod_feedback_idea_stages",
        args.stage,
      );
      const { data: changes, error } = await ctx.admin.rpc(
        "mod_feedback_set_idea_stage",
        {
          _idea: args.ideaId,
          _stage: stage.id,
          _message: args.message,
          _notify: args.notifyVoters ?? true,
          _origin: "user",
          _actor: ctx.userId,
        },
      );
      fail(error);
      const rows = changes ?? [];
      if (rows.length) {
        const { data: st } = await ctx.admin
          .from("mod_feedback_idea_stages")
          .select("portal_status_id, mod_feedback_statuses(name)")
          .eq("id", stage.id)
          .maybeSingle();
        const statusName =
          (st?.mod_feedback_statuses as { name?: string } | null)?.name ??
          stage.name;
        notifyCascade(rows, statusName, args.message, ctx.userId);
      }
      return { stage: stage.name, postsMoved: rows.length };
    },
  }),

  defineMcpTool({
    name: "feedback_inbox",
    title: "Feedback inbox",
    description:
      "What's waiting for staff: posts awaiting approval and pending Autopilot items (duplicate suggestions, feedback from the API or chat).",
    readOnly: true,
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    run: async (args, ctx) => {
      await requireStaff(ctx);
      const limit = args.limit ?? 25;
      const [pending, inbox] = await Promise.all([
        ctx.admin
          .from("mod_feedback_posts")
          .select("id, title, board_id, created_at")
          .eq("approval_state", "pending")
          .is("deleted_at", null)
          .order("created_at")
          .limit(limit),
        ctx.admin
          .from("mod_feedback_inbox")
          .select(
            "id, kind, source, post_id, suggested_post_id, title, raw_text, author_email, confidence, created_at",
          )
          .eq("state", "pending")
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);
      return {
        awaitingApproval: pending.data ?? [],
        autopilot: inbox.data ?? [],
      };
    },
  }),

  defineMcpTool({
    name: "feedback_inbox_resolve",
    title: "Resolve an inbox item",
    description:
      "accept: create the post (or keep both, for a duplicate suggestion); merge: merge the duplicate, or add the feedback to targetPostId / the suggested post as an internal note + the author's vote; dismiss.",
    inputSchema: {
      id: z.string().uuid(),
      action: z.enum(["accept", "merge", "dismiss"]),
      targetPostId: z.string().uuid().optional(),
    },
    run: async (args, ctx) => {
      await requireStaff(ctx);
      return resolveInboxItem(
        ctx.admin,
        ctx.userId,
        args.id,
        args.action,
        args.targetPostId,
      );
    },
  }),

  defineMcpTool({
    name: "feedback_changelog_draft",
    title: "Draft a changelog entry",
    description:
      "Create a DRAFT changelog entry in /admin from plain text (blank lines separate paragraphs), optionally linked to the ideas it ships. Publishing it (in /admin) moves those ideas to the shipped stage and tells their voters once.",
    inputSchema: {
      title: z.string().trim().min(1).max(200),
      text: z.string().trim().min(1).max(20000),
      excerpt: z.string().max(300).optional(),
      type: z
        .string()
        .optional()
        .describe("Changelog type key, e.g. new, improved, fixed."),
      ideaIds: z.array(z.string().uuid()).max(20).optional(),
    },
    run: async (args, ctx) => {
      await requireStaff(ctx);
      const entry = await ctx.payload.create({
        collection: "mod-feedback-changelog",
        draft: true,
        data: {
          title: args.title,
          excerpt: args.excerpt ?? args.text.split(/\n/)[0]?.slice(0, 300),
          body: lexicalFromText(args.text),
          type: args.type ?? "new",
          audience: "everyone",
          notifySubscribers: true,
          linkedIdeas: args.ideaIds ?? [],
          _status: "draft",
        } as unknown as RequiredDataFromCollectionSlug<"mod-feedback-changelog">,
        overrideAccess: false,
        user: ctx.cmsUser,
      });
      return {
        id: entry.id,
        editUrl: `${ctx.origin}/admin/collections/mod-feedback-changelog/${entry.id}`,
      };
    },
  }),

  defineMcpTool({
    name: "feedback_insights",
    title: "Feedback insights",
    description:
      "Totals for the last N days vs the period before (posts, votes, voters, comments, shipped), top requests by votes gained, and breakdowns by status, board and source.",
    readOnly: true,
    inputSchema: {
      days: z.number().int().min(1).max(365).optional().describe("Default 30."),
    },
    run: async (args, ctx) => {
      await requireStaff(ctx);
      const { data, error } = await ctx.admin.rpc("mod_feedback_insights", {
        _since: new Date(
          Date.now() - (args.days ?? 30) * 86400_000,
        ).toISOString(),
      });
      fail(error);
      const ins = data as unknown as Insights;
      return { ...ins, series: undefined };
    },
  }),
];

export const mcp: ModMcpExtension = {
  instructions:
    "Feedback tools (feedback_*) triage the feedback portal: search and read posts, change statuses, comment, manage roadmap ideas, work the inbox, see insights and draft changelog entries.",
  tools,
  collections: [
    {
      slug: "mod-feedback-changelog",
      label: "Changelog",
      group: "Feedback",
      titleField: "title",
      searchFields: ["title", "excerpt"],
      publicPath: (doc) =>
        typeof doc.slug === "string" ? `/changelog/${doc.slug}` : null,
      chatgptSearch: true,
    },
  ],
};
