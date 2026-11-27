import type { PostFeed, StatusLite } from "../data";

/** A post's timeline entry as the activity feed renders it. */
export type FeedEntry =
  | {
      kind: "comment";
      id: string;
      at: string;
      authorId: string | null;
      body: string;
      parentId: string | null;
      internal: boolean;
      pinned: boolean;
      edited: boolean;
    }
  | {
      kind: "status";
      id: string;
      at: string;
      authorId: string | null;
      toStatus: { name: string; tone: string } | null;
      message: string | null;
    };

/** Map `getPostFeed()` items to feed entries (server page and embed). */
export function feedEntries(
  feed: Pick<PostFeed, "items">,
  statusById: Map<string, StatusLite>,
): FeedEntry[] {
  return feed.items.map((i) =>
    i.kind === "comment"
      ? {
          kind: "comment",
          id: i.comment.id,
          at: i.at,
          authorId: i.comment.author_id,
          body: i.comment.body,
          parentId: i.comment.parent_id,
          internal: i.comment.is_internal,
          pinned: i.comment.pinned,
          edited: Boolean(i.comment.edited_at),
        }
      : {
          kind: "status",
          id: i.change.id,
          at: i.at,
          authorId: i.change.changed_by,
          toStatus: i.change.to_status_id
            ? (statusById.get(i.change.to_status_id) ?? null)
            : null,
          message: i.change.message,
        },
  );
}

/** Anonymous-capable writes on a board: its own rule, else the global one. */
export function boardAnon(
  global: { votes: boolean; posts: boolean; comments: boolean },
  board: { anon_votes: string; anon_posts: string; anon_comments: string },
) {
  const pick = (rule: string, fallback: boolean) =>
    rule === "allow" ? true : rule === "deny" ? false : fallback;
  return {
    votes: pick(board.anon_votes, global.votes),
    posts: pick(board.anon_posts, global.posts),
    comments: pick(board.anon_comments, global.comments),
  };
}
