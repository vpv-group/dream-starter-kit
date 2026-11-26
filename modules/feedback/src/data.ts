import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@acme/api";

import type { Sort, StatusType, Tone } from "./shared/config";

/**
 * Read-side queries shared by the web RSC pages (server client), the native
 * screens and the staff UI (react-query hooks). All run through the caller's
 * RLS-scoped client, so visibility is Postgres's decision. Client-safe.
 */

type Db = SupabaseClient<Database>;

export type Post = Tables<"mod_feedback_posts">;
export type Board = Tables<"mod_feedback_boards">;
export type Status = Tables<"mod_feedback_statuses">;
export type Category = Tables<"mod_feedback_categories">;
export type Comment = Tables<"mod_feedback_comments">;
export type StatusChange = Tables<"mod_feedback_status_changes">;

export interface BoardForm {
  titleLabel: string;
  titlePlaceholder: string;
  detailsLabel: string;
  detailsPlaceholder: string;
  submitLabel: string;
  allowAttachments: boolean;
  customFields: {
    key: string;
    label: string;
    required: boolean;
    type: "text" | "textarea" | "select";
    placeholder: string;
    options: string[];
  }[];
}

export function formOf(board: Pick<Board, "form">): BoardForm {
  const f = (board.form ?? {}) as Partial<BoardForm>;
  return {
    titleLabel: f.titleLabel ?? "Title",
    titlePlaceholder: f.titlePlaceholder ?? "Short, descriptive title",
    detailsLabel: f.detailsLabel ?? "Details",
    detailsPlaceholder: f.detailsPlaceholder ?? "Any additional details…",
    submitLabel: f.submitLabel ?? "Create Post",
    allowAttachments: f.allowAttachments ?? true,
    customFields: f.customFields ?? [],
  };
}

export interface StatusLite {
  id: string;
  name: string;
  type: StatusType;
  tone: Tone;
  position: number;
  show_on_roadmap: boolean;
  is_default: boolean;
}

export async function listBoards(
  db: Db,
): Promise<(Board & { post_count: number })[]> {
  const [boards, counts] = await Promise.all([
    db
      .from("mod_feedback_boards")
      .select("*")
      .eq("archived", false)
      .order("position"),
    db.rpc("mod_feedback_board_counts"),
  ]);
  if (boards.error) throw boards.error;
  const byBoard = new Map(
    (counts.data ?? []).map((c) => [c.board_id, Number(c.post_count)]),
  );
  return boards.data.map((b) => ({ ...b, post_count: byBoard.get(b.id) ?? 0 }));
}

export async function listStatuses(db: Db): Promise<StatusLite[]> {
  const { data, error } = await db
    .from("mod_feedback_statuses")
    .select("id, name, type, tone, position, show_on_roadmap, is_default")
    .order("position");
  if (error) throw error;
  return data as StatusLite[];
}

export async function listCategories(
  db: Db,
  boardId: string,
): Promise<Category[]> {
  const { data, error } = await db
    .from("mod_feedback_categories")
    .select("*")
    .eq("board_id", boardId)
    .eq("archived", false)
    .order("position");
  if (error) throw error;
  return data;
}

export const PAGE_SIZE = 20;

export async function listPosts(
  db: Db,
  args: {
    boardId?: string | null;
    sort?: Sort;
    statuses?: string[];
    q?: string | null;
    page?: number;
    limit?: number;
  },
): Promise<Post[]> {
  const limit = args.limit ?? PAGE_SIZE;
  const { data, error } = await db.rpc("mod_feedback_list_posts", {
    _board: args.boardId ?? undefined,
    _sort: args.sort ?? "trending",
    _statuses: args.statuses?.length ? args.statuses : undefined,
    _q: args.q ?? undefined,
    _limit: limit,
    _offset: (args.page ?? 0) * limit,
  });
  if (error) throw error;
  return data;
}

/** Posts in roadmap statuses, most recently moved first (Canny's roadmap order). */
export async function listRoadmapPosts(
  db: Db,
  statusIds: string[],
  boardIds?: string[],
): Promise<Post[]> {
  if (!statusIds.length) return [];
  let q = db
    .from("mod_feedback_posts")
    .select("*")
    .in("status_id", statusIds)
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .is("merged_into_id", null)
    .order("status_changed_at", { ascending: false })
    .limit(300);
  if (boardIds?.length) q = q.in("board_id", boardIds);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getBoardBySlug(
  db: Db,
  slug: string,
): Promise<Board | null> {
  const { data } = await db
    .from("mod_feedback_boards")
    .select("*")
    .eq("slug", slug)
    .eq("archived", false)
    .maybeSingle();
  return data ?? null;
}

export async function getPost(
  db: Db,
  boardId: string,
  slug: string,
): Promise<Post | null> {
  const { data } = await db
    .from("mod_feedback_posts")
    .select("*")
    .eq("board_id", boardId)
    .eq("slug", slug)
    .maybeSingle();
  return data ?? null;
}

export interface Person {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_staff: boolean;
}

export async function getPeople(db: Db, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  if (!unique.length) return new Map<string, Person>();
  const { data } = await db.rpc("mod_feedback_people", { _ids: unique });
  return new Map((data ?? []).map((p) => [p.id, p as Person]));
}

export type FeedItem =
  | { kind: "comment"; at: string; comment: Comment }
  | { kind: "status"; at: string; change: StatusChange };

export interface PostFeed {
  items: FeedItem[];
  people: Map<string, Person>;
  reactions: Map<string, { likes: number; mine: boolean }>;
}

/** Comments + status changes as one timeline (Canny's activity feed). */
export async function getPostFeed(db: Db, postId: string): Promise<PostFeed> {
  const [comments, changes] = await Promise.all([
    db
      .from("mod_feedback_comments")
      .select("*")
      .eq("post_id", postId)
      .is("deleted_at", null)
      .order("created_at"),
    db
      .from("mod_feedback_status_changes")
      .select("*")
      .eq("post_id", postId)
      .order("created_at"),
  ]);
  const items: FeedItem[] = [
    ...(comments.data ?? []).map(
      (comment) =>
        ({ kind: "comment", at: comment.created_at, comment }) as const,
    ),
    ...(changes.data ?? []).map(
      (change) => ({ kind: "status", at: change.created_at, change }) as const,
    ),
  ];
  const ids = items.map((i) =>
    i.kind === "comment" ? i.comment.id : i.change.id,
  );
  const [people, reactions] = await Promise.all([
    getPeople(
      db,
      items.map((i) =>
        i.kind === "comment" ? i.comment.author_id : i.change.changed_by,
      ),
    ),
    ids.length
      ? db.rpc("mod_feedback_reaction_counts", { _ids: ids })
      : Promise.resolve({
          data: [] as { target_id: string; likes: number; mine: boolean }[],
        }),
  ]);
  return {
    items,
    people,
    reactions: new Map(
      (reactions.data ?? []).map((r) => [
        r.target_id,
        { likes: Number(r.likes), mine: Boolean(r.mine) },
      ]),
    ),
  };
}

export interface Voter {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  priority: string | null;
  total: number;
}

export async function getVoters(
  db: Db,
  postId: string,
  limit = 15,
): Promise<Voter[]> {
  const { data } = await db.rpc("mod_feedback_post_voters", {
    _post: postId,
    _limit: limit,
  });
  return (data ?? []).map((v) => ({ ...v, total: Number(v.total) }));
}

/** Which of these posts the signed-in user voted on. */
export async function getMyVotes(
  db: Db,
  postIds: string[],
): Promise<Set<string>> {
  if (!postIds.length) return new Set();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return new Set();
  const { data } = await db
    .from("mod_feedback_votes")
    .select("post_id")
    .eq("user_id", auth.user.id)
    .in("post_id", postIds);
  return new Set((data ?? []).map((v) => v.post_id));
}

export async function isSubscribed(db: Db, postId: string): Promise<boolean> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return false;
  const { data } = await db
    .from("mod_feedback_subscriptions")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return Boolean(data);
}

export async function isStaffViewer(db: Db): Promise<boolean> {
  const { data } = await db.rpc("mod_feedback_is_staff");
  return Boolean(data);
}
