import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";

import type { Database } from "@acme/api";

import type { FeedbackAi } from "./ai";
import { toVector } from "./vector";

/**
 * Autopilot — AI triage. Pure-ish functions over an injected service-role
 * client and AI (unit-testable with fakes). Every action it takes on its own
 * is recorded (inbox row + activity log) and reversible (unmerge).
 */

type Db = SupabaseClient<Database>;

export interface AutopilotSettings {
  enabled: boolean;
  actions: "manual" | "automated";
  dedupe: boolean;
  threshold: number;
  mergeAsVotes: boolean;
  categorize: boolean;
  summaries: boolean;
  drafts: boolean;
  dailyCap: number;
  apiBoard: string;
  replies: boolean;
  replyAs: string | null;
  instructions: string | null;
}

export function autopilotSettings(
  ap: Partial<Record<keyof AutopilotSettings, unknown>> | null | undefined,
): AutopilotSettings {
  const a = ap ?? {};
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    enabled: bool(a.enabled, true),
    actions: a.actions === "automated" ? "automated" : "manual",
    dedupe: bool(a.dedupe, true),
    threshold: typeof a.threshold === "number" ? a.threshold : 0.86,
    mergeAsVotes: bool(a.mergeAsVotes, true),
    categorize: bool(a.categorize, true),
    summaries: bool(a.summaries, true),
    drafts: bool(a.drafts, true),
    dailyCap: typeof a.dailyCap === "number" ? a.dailyCap : 200,
    apiBoard:
      typeof a.apiBoard === "string" && a.apiBoard
        ? a.apiBoard
        : "feature-requests",
    replies: bool(a.replies, false),
    replyAs: typeof a.replyAs === "string" && a.replyAs ? a.replyAs : null,
    instructions: typeof a.instructions === "string" ? a.instructions : null,
  };
}

/**
 * Pick the duplicate to suggest: the most similar OLDER post over the bar;
 * on a tie, the oldest (the original, not another copy of it).
 */
export function pickDuplicate<
  T extends { id: string; similarity: number; created_at?: string },
>(candidates: T[], threshold: number, postCreatedAt: string): T | null {
  return (
    candidates
      .filter((c) => c.similarity >= threshold)
      .filter((c) => !c.created_at || c.created_at <= postCreatedAt)
      .sort(
        (a, b) =>
          b.similarity - a.similarity ||
          (a.created_at ?? "").localeCompare(b.created_at ?? ""),
      )[0] ?? null
  );
}

const categorySchema = z.object({ key: z.string().nullable() });

async function categorize(
  db: Db,
  ai: FeedbackAi,
  post: { id: string; board_id: string; title: string; details: string },
): Promise<string | null> {
  const { data: cats } = await db
    .from("mod_feedback_categories")
    .select("id, name")
    .eq("board_id", post.board_id)
    .eq("archived", false);
  if (!cats?.length) return null;
  const options = cats.map((c) => `- ${c.id}: ${c.name}`).join("\n");
  const { key } = await ai.object(
    `File this product feedback into ONE category, or null if none fits.\n\nCategories (id: name):\n${options}\n\nFeedback title: ${post.title}\nDetails: ${post.details.slice(0, 2000)}\n\nAnswer with the category id as "key".`,
    categorySchema,
  );
  const match = cats.find((c) => c.id === key);
  if (!match) return null;
  await db
    .from("mod_feedback_posts")
    .update({ category_id: match.id })
    .eq("id", post.id);
  return match.id;
}

/** Process new posts once: embed, file, dedupe, smart-reply. */
export async function processNewPosts(
  db: Db,
  ai: FeedbackAi,
  s: AutopilotSettings,
  now = new Date(),
): Promise<{
  processed: number;
  duplicates: number;
  merged: number;
  categorized: number;
}> {
  const result = { processed: 0, duplicates: 0, merged: 0, categorized: 0 };
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: today } = await db
    .from("mod_feedback_posts")
    .select("id", { count: "exact", head: true })
    .gte("ai_processed_at", dayStart.toISOString());
  const budget = Math.min(20, Math.max(s.dailyCap - (today ?? 0), 0));
  if (!budget) return result;

  const { data: posts } = await db
    .from("mod_feedback_posts")
    .select(
      "id, board_id, category_id, title, details, source, created_at, approval_state",
    )
    .is("ai_processed_at", null)
    .is("deleted_at", null)
    .is("merged_into_id", null)
    .order("created_at")
    .limit(budget);

  for (const post of posts ?? []) {
    try {
      const vector = await ai.embed(`${post.title}\n\n${post.details}`);
      await db
        .from("mod_feedback_posts")
        .update({ embedding: toVector(vector) })
        .eq("id", post.id);

      if (s.categorize && !post.category_id) {
        if (await categorize(db, ai, post)) result.categorized++;
      }

      if (s.dedupe) {
        const { data: similar } = await db.rpc(
          "mod_feedback_similar_by_embedding",
          {
            _embedding: toVector(vector),
            _board: post.board_id,
            _exclude: post.id,
            _limit: 3,
          },
        );
        const ids = (similar ?? []).map((p) => p.id);
        const { data: dates } = ids.length
          ? await db
              .from("mod_feedback_posts")
              .select("id, created_at")
              .in("id", ids)
          : { data: [] as { id: string; created_at: string }[] };
        const created = new Map((dates ?? []).map((d) => [d.id, d.created_at]));
        const dup = pickDuplicate(
          (similar ?? []).map((p) => ({ ...p, created_at: created.get(p.id) })),
          s.threshold,
          post.created_at,
        );
        if (dup) {
          const automate =
            s.actions === "automated" &&
            s.mergeAsVotes &&
            post.source === "portal";
          if (automate) {
            const { error } = await db.rpc("mod_feedback_merge_posts", {
              _source: post.id,
              _target: dup.id,
            });
            if (!error) result.merged++;
          }
          await db.from("mod_feedback_inbox").insert({
            kind: "duplicate",
            source: "autopilot",
            post_id: post.id,
            suggested_post_id: dup.id,
            confidence: dup.similarity,
            state: automate ? "merged" : "pending",
            resolved_at: automate ? now.toISOString() : null,
          });
          result.duplicates++;
        }
      }

      if (s.replies && s.replyAs && post.details.trim().length < 40) {
        const reply = await ai.text(
          `You help a product team understand feedback. Write ONE short, friendly follow-up question (max 2 sentences) asking for the detail that would make this request actionable. ${s.instructions ?? ""}\n\nTitle: ${post.title}\nDetails: ${post.details || "(none)"}`,
          200,
        );
        if (reply) {
          await db.from("mod_feedback_comments").insert({
            post_id: post.id,
            author_id: s.replyAs,
            body: reply,
          });
        }
      }
      await db
        .from("mod_feedback_posts")
        .update({ ai_processed_at: now.toISOString() })
        .eq("id", post.id);
      result.processed++;
    } catch (err) {
      console.error(`[feedback] autopilot post ${post.id}`, err);
      // Don't retry forever on a poison post.
      await db
        .from("mod_feedback_posts")
        .update({ ai_processed_at: now.toISOString() })
        .eq("id", post.id);
    }
  }
  return result;
}

const extractSchema = z.object({
  isFeedback: z.boolean(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
});

/** Extracted (API / chat) inbox items: title them and find a matching post. */
export async function processInbox(
  db: Db,
  ai: FeedbackAi,
  s: AutopilotSettings,
): Promise<{ processed: number }> {
  const { data: items } = await db
    .from("mod_feedback_inbox")
    .select("id, raw_text, title")
    .eq("kind", "extracted")
    .eq("state", "pending")
    .is("confidence", null)
    .limit(20);
  const { data: board } = await db
    .from("mod_feedback_boards")
    .select("id")
    .eq("slug", s.apiBoard)
    .maybeSingle();
  let processed = 0;
  for (const item of items ?? []) {
    try {
      const x = await ai.object(
        `Is this message product feedback (a feature request, bug or usability problem)? If so, give a short title (max 80 chars, like a feature request) and a one-sentence summary.\n\nMessage:\n"""${(item.raw_text ?? "").slice(0, 4000)}"""`,
        extractSchema,
      );
      if (!x.isFeedback) {
        await db
          .from("mod_feedback_inbox")
          .update({
            state: "dismissed",
            confidence: 0,
            resolved_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        processed++;
        continue;
      }
      const vector = await ai.embed(
        `${x.title ?? ""}\n\n${x.summary ?? item.raw_text ?? ""}`,
      );
      const { data: similar } = await db.rpc(
        "mod_feedback_similar_by_embedding",
        {
          _embedding: toVector(vector),
          _limit: 1,
        },
      );
      const top = similar?.[0];
      await db
        .from("mod_feedback_inbox")
        .update({
          title: item.title ?? x.title,
          suggested_board_id: board?.id ?? null,
          suggested_post_id:
            top && top.similarity >= s.threshold ? top.id : null,
          confidence: top?.similarity ?? 0.01,
        })
        .eq("id", item.id);
      processed++;
    } catch (err) {
      console.error(`[feedback] autopilot inbox ${item.id}`, err);
    }
  }
  return { processed };
}

export interface IngestInput {
  source: string;
  text: string;
  title?: string | null;
  email?: string | null;
  name?: string | null;
  ref?: Record<string, unknown>;
}

/** Add raw feedback from a source (inbound API, chat adapter…) to the inbox. */
export async function ingestFeedback(
  db: Db,
  input: IngestInput,
): Promise<string> {
  const { data, error } = await db
    .from("mod_feedback_inbox")
    .insert({
      kind: "extracted",
      source: input.source,
      raw_text: input.text.slice(0, 10000),
      title: input.title ?? null,
      author_email: input.email?.toLowerCase() ?? null,
      author_name: input.name ?? null,
      origin_ref: (input.ref ??
        {}) as Database["public"]["Tables"]["mod_feedback_inbox"]["Insert"]["origin_ref"],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function userIdByEmail(
  db: Db,
  email: string | null,
): Promise<string | null> {
  if (!email) return null;
  for (let page = 1; page <= 20; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Staff decision on an inbox item. */
export async function resolveInboxItem(
  db: Db,
  staffId: string,
  id: string,
  action: "accept" | "merge" | "dismiss",
  targetPostId?: string | null,
  /** Board for accepted feedback the cron hasn't triaged (e.g. AI is off). */
  fallbackBoardId?: string | null,
): Promise<{ postId?: string }> {
  const { data: item } = await db
    .from("mod_feedback_inbox")
    .select("*")
    .eq("id", id)
    .single();
  if (!item) throw new Error("Inbox item not found");
  const done = (state: "accepted" | "merged" | "dismissed", post_id?: string) =>
    db
      .from("mod_feedback_inbox")
      .update({
        state,
        resolved_by: staffId,
        resolved_at: new Date().toISOString(),
        ...(post_id ? { post_id } : {}),
      })
      .eq("id", id);

  if (action === "dismiss") {
    await done("dismissed");
    return {};
  }

  if (item.kind === "duplicate") {
    if (action === "merge" && item.post_id && item.suggested_post_id) {
      const { error } = await db.rpc("mod_feedback_merge_posts", {
        _source: item.post_id,
        _target: targetPostId ?? item.suggested_post_id,
      });
      if (error) throw new Error(error.message);
      await done("merged");
    } else {
      await done("accepted"); // "Not a duplicate": keep the post.
    }
    return {};
  }

  // Extracted feedback.
  const authorId = await userIdByEmail(db, item.author_email);
  const target = targetPostId ?? item.suggested_post_id;
  if (action === "merge" && target) {
    await db.from("mod_feedback_comments").insert({
      post_id: target,
      author_id: staffId,
      is_internal: true,
      body: `From ${item.source}${item.author_email ? ` (${item.author_email})` : ""}:\n\n${item.raw_text ?? ""}`,
    });
    if (authorId) {
      await db
        .from("mod_feedback_votes")
        .upsert(
          { post_id: target, user_id: authorId, created_by: staffId },
          { onConflict: "post_id,user_id", ignoreDuplicates: true },
        );
    }
    await done("merged", target);
    return { postId: target };
  }
  const boardId = item.suggested_board_id ?? fallbackBoardId;
  if (!boardId)
    throw new Error("No board for this feedback (Settings → Autopilot).");
  const { data: post, error } = await db
    .from("mod_feedback_posts")
    .insert({
      board_id: boardId,
      author_id: authorId,
      title: (item.title ?? item.raw_text ?? "Feedback").slice(0, 200),
      details: item.raw_text ?? "",
      slug: "pending",
      source: item.source === "portal" ? "api" : item.source,
      source_ref: item.origin_ref,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await done("accepted", post.id);
  return { postId: post.id };
}

/** Summarize a post's discussion (cached until new comments arrive). */
export async function summarizePost(
  db: Db,
  ai: FeedbackAi,
  postId: string,
): Promise<string> {
  const { data: post } = await db
    .from("mod_feedback_posts")
    .select("title, details, comment_count, summary, summary_comment_count")
    .eq("id", postId)
    .single();
  if (!post) throw new Error("Post not found");
  if (post.summary && post.summary_comment_count === post.comment_count)
    return post.summary;
  const { data: comments } = await db
    .from("mod_feedback_comments")
    .select("body, is_internal")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at")
    .limit(200);
  const thread = (comments ?? [])
    .map((c) => `${c.is_internal ? "[internal] " : ""}${c.body}`)
    .join("\n---\n")
    .slice(0, 12000);
  const summary = await ai.text(
    `Summarize this product-feedback thread for the product team in 3–5 short bullet points: what people want, why, notable edge cases, and any disagreement. No preamble.\n\nRequest: ${post.title}\n${post.details}\n\nComments:\n${thread || "(no comments)"}`,
    500,
  );
  await db
    .from("mod_feedback_posts")
    .update({ summary, summary_comment_count: post.comment_count })
    .eq("id", postId);
  return summary;
}

const draftSchema = z.object({
  title: z.string(),
  excerpt: z.string(),
  paragraphs: z.array(z.string()).min(1).max(6),
});

/** Draft a changelog entry announcing shipped ideas (staff then edit it). */
export async function draftChangelog(
  db: Db,
  ai: FeedbackAi,
  ideaIds: string[],
): Promise<z.infer<typeof draftSchema>> {
  const { data: ideas } = await db
    .from("mod_feedback_ideas")
    .select("id, title, description, vote_total")
    .in("id", ideaIds);
  const { data: posts } = await db
    .from("mod_feedback_posts")
    .select("idea_id, title, details")
    .in("idea_id", ideaIds)
    .order("vote_count", { ascending: false })
    .limit(30);
  const brief = (ideas ?? [])
    .map((i) => {
      const requests = (posts ?? [])
        .filter((p) => p.idea_id === i.id)
        .slice(0, 5)
        .map((p) => `  - ${p.title}: ${p.details.slice(0, 200)}`)
        .join("\n");
      return `Idea: ${i.title} (${i.vote_total} votes)\n${i.description}\nCustomer requests:\n${requests}`;
    })
    .join("\n\n");
  return ai.object(
    `Write a changelog entry announcing what shipped, for the product's users. Plain, friendly, specific; no hype, no emojis. Title (max 60 chars), a one-sentence excerpt, and 1–4 short paragraphs.\n\n${brief}`,
    draftSchema,
  );
}
