import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";
import { notify } from "@acme/mod-notifications/server";

import { VOTE_MILESTONES } from "../shared/config";

/**
 * Notification fan-out for the feedback module (categories registered in
 * 001_initial.sql). Always called with the service-role client (it notifies
 * other users) from `after()`, so a slow fan-out never delays a response.
 * Every notification carries a dedupe key: retries never double-deliver.
 */

type Db = SupabaseClient<Database>;
export type NotifyFn = typeof notify;

export interface PostRef {
  id: string;
  title: string;
  slug: string;
  boardSlug: string;
}

export const postUrl = (p: Pick<PostRef, "boardSlug" | "slug">) =>
  `/feedback/${p.boardSlug}/p/${p.slug}`;

export async function loadPostRef(
  db: Db,
  postId: string,
): Promise<PostRef | null> {
  const { data } = await db
    .from("mod_feedback_posts")
    .select("id, title, slug, board:mod_feedback_boards!inner(slug)")
    .eq("id", postId)
    .maybeSingle();
  if (!data) return null;
  const board = data.board;
  return {
    id: data.id,
    title: data.title,
    slug: data.slug,
    boardSlug: board.slug,
  };
}

async function subscribers(db: Db, postId: string): Promise<string[]> {
  const { data } = await db
    .from("mod_feedback_subscriptions")
    .select("user_id")
    .eq("post_id", postId);
  return (data ?? []).map((r) => r.user_id);
}

async function staffIds(db: Db): Promise<string[]> {
  const { data } = await db.from("profiles").select("id").eq("is_staff", true);
  return (data ?? []).map((r) => r.id);
}

/** "X changed status to Planned" → everyone following the post. */
export async function notifyStatusChange(
  db: Db,
  args: {
    postId: string;
    changeId: string;
    statusName: string;
    message?: string | null;
    actorId?: string | null;
  },
  notifyImpl: NotifyFn = notify,
): Promise<number> {
  const post = await loadPostRef(db, args.postId);
  if (!post) return 0;
  const users = (await subscribers(db, args.postId)).filter(
    (u) => u !== args.actorId,
  );
  for (const userId of users) {
    await notifyImpl(db, {
      userId,
      category: "feedback.post.status_changed",
      title: `${post.title} is now ${args.statusName}`,
      body: args.message ?? undefined,
      url: postUrl(post),
      entity: { type: "feedback_post", id: post.id },
      actorId: args.actorId ?? undefined,
      sourceModule: "feedback",
      dedupeKey: `feedback:status:${args.changeId}:${userId}`,
    });
  }
  return users.length;
}

/** Staff comment → followers; any reply → the parent comment's author. */
export async function notifyComment(
  db: Db,
  args: {
    postId: string;
    commentId: string;
    authorId: string;
    authorIsStaff: boolean;
    parentAuthorId?: string | null;
    body: string;
    notifyFollowers: boolean;
  },
  notifyImpl: NotifyFn = notify,
): Promise<void> {
  const post = await loadPostRef(db, args.postId);
  if (!post) return;
  const recipients = new Set<string>();
  if (args.authorIsStaff && args.notifyFollowers) {
    for (const u of await subscribers(db, args.postId)) recipients.add(u);
  }
  if (args.parentAuthorId) recipients.add(args.parentAuthorId);
  recipients.delete(args.authorId);
  const snippet =
    args.body.length > 140 ? `${args.body.slice(0, 137)}…` : args.body;
  for (const userId of recipients) {
    await notifyImpl(db, {
      userId,
      category: "feedback.post.comment",
      title: `New comment on ${post.title}`,
      body: snippet,
      url: postUrl(post),
      entity: { type: "feedback_post", id: post.id },
      actorId: args.authorId,
      sourceModule: "feedback",
      dedupeKey: `feedback:comment:${args.commentId}:${userId}`,
    });
  }
}

export async function notifyStaffNewPost(
  db: Db,
  args: { postId: string; authorId: string },
  notifyImpl: NotifyFn = notify,
): Promise<void> {
  const post = await loadPostRef(db, args.postId);
  if (!post) return;
  for (const userId of await staffIds(db)) {
    if (userId === args.authorId) continue;
    await notifyImpl(db, {
      userId,
      category: "feedback.post.created",
      title: `New feedback: ${post.title}`,
      url: postUrl(post),
      entity: { type: "feedback_post", id: post.id },
      actorId: args.authorId,
      sourceModule: "feedback",
      dedupeKey: `feedback:new:${post.id}:${userId}`,
    });
  }
}

/** The milestone a vote count just reached, if it is one staff asked about. */
export function reachedMilestone(
  voteCount: number,
  enabled: readonly (string | number)[],
): number | null {
  const wanted = new Set(enabled.map(Number));
  return (VOTE_MILESTONES as readonly number[]).includes(voteCount) &&
    wanted.has(voteCount)
    ? voteCount
    : null;
}

export async function notifyMilestone(
  db: Db,
  args: { postId: string; votes: number },
  notifyImpl: NotifyFn = notify,
): Promise<void> {
  const post = await loadPostRef(db, args.postId);
  if (!post) return;
  for (const userId of await staffIds(db)) {
    await notifyImpl(db, {
      userId,
      category: "feedback.post.milestone",
      title: `${post.title} reached ${args.votes} votes`,
      url: postUrl(post),
      entity: { type: "feedback_post", id: post.id },
      sourceModule: "feedback",
      dedupeKey: `feedback:milestone:${post.id}:${args.votes}:${userId}`,
    });
  }
}

export async function notifyAssigned(
  db: Db,
  args: { postId: string; ownerId: string; actorId: string },
  notifyImpl: NotifyFn = notify,
): Promise<void> {
  if (args.ownerId === args.actorId) return;
  const post = await loadPostRef(db, args.postId);
  if (!post) return;
  await notifyImpl(db, {
    userId: args.ownerId,
    category: "feedback.post.assigned",
    title: `You own ${post.title}`,
    url: postUrl(post),
    entity: { type: "feedback_post", id: post.id },
    actorId: args.actorId,
    sourceModule: "feedback",
    dedupeKey: `feedback:assigned:${post.id}:${args.ownerId}:${Date.now()}`,
  });
}
