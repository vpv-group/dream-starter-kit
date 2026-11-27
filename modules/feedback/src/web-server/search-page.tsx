import { SearchIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@acme/ui/empty";

import { getMyVotes, listPosts } from "../data";
import { PostRow } from "../web/components/post-row";
import { anonFor, loadPortal } from "./portal-data";
import { PortalShell } from "./portal-shell";
import { createServerSupabase } from "./supabase";

export const metadata = { title: "Search · Feedback" };

/** Portal search results (/feedback/search?search=…), across readable boards. */
export async function FeedbackSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.search ?? sp.q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 200) ?? "";
  const portal = await loadPortal();
  const db = await createServerSupabase();
  const posts = q ? await listPosts(db, { q, sort: "top", limit: 50 }) : [];
  const myVotes = await getMyVotes(
    db,
    posts.map((p) => p.id),
  );
  const boardById = new Map(portal.boards.map((b) => [b.id, b]));
  const statusById = new Map(portal.statuses.map((s) => [s.id, s]));

  return (
    <PortalShell portal={portal}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-bold tracking-tight">
          {q ? <>Search results for “{q}”</> : "Search"}
        </h1>
        {posts.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>{q ? "Nothing found" : "Type to search"}</EmptyTitle>
              <EmptyDescription>
                {q
                  ? "Try different words, or post a new idea."
                  : "Search every board you can see."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {posts.map((p) => {
              const board = boardById.get(p.board_id);
              if (!board) return null;
              return (
                <PostRow
                  key={p.id}
                  post={p}
                  href={`/feedback/${board.slug}/p/${p.slug}`}
                  status={p.status_id ? statusById.get(p.status_id) : undefined}
                  voted={myVotes.has(p.id)}
                  anonVotes={anonFor(portal, board).votes}
                  showVoteCounts={board.show_vote_counts}
                  boardName={board.name}
                />
              );
            })}
          </ul>
        )}
      </div>
    </PortalShell>
  );
}
