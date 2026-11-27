import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LightbulbIcon } from "lucide-react";

import { Button } from "@acme/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@acme/ui/empty";

import type { Sort } from "../shared/config";
import {
  formOf,
  getBoardBySlug,
  getMyVotes,
  listCategories,
  listPosts,
  PAGE_SIZE,
} from "../data";
import { BoardSearch } from "../web/components/board-search";
import { CreatePostForm } from "../web/components/create-post-form";
import { PostRow } from "../web/components/post-row";
import { SortFilterMenu } from "../web/components/sort-filter-menu";
import { BoardsSidebar } from "./boards-sidebar";
import { anonFor, loadPortal } from "./portal-data";
import { PortalShell } from "./portal-shell";
import { createServerSupabase } from "./supabase";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ board: string }>;
}): Promise<Metadata> {
  const { board: slug } = await params;
  const board = await getBoardBySlug(await createServerSupabase(), slug).catch(
    () => null,
  );
  return {
    title: board ? `${board.name} · Feedback` : "Feedback",
    description: board?.description ?? undefined,
    robots: board?.search_indexing
      ? undefined
      : { index: false, follow: false },
  };
}

/**
 * A feedback board (Canny): BOARDS sidebar + the inline create card, the
 * "Showing [Trending ▾]" sort/filter menu, board search, and the post list
 * with vote boxes on the right. Phones drop the sidebar, form and list
 * search — Create lives in the header and boards in the tab-row switcher.
 */
export async function FeedbackBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ board: string }>;
  searchParams: SearchParams;
}) {
  const [{ board: slug }, sp] = await Promise.all([params, searchParams]);
  const portal = await loadPortal();
  const board = portal.boards.find((b) => b.slug === slug);
  if (!board) notFound();

  const sort = (
    ["trending", "top", "new"].includes(one(sp.sort) ?? "")
      ? one(sp.sort)
      : "trending"
  ) as Sort;
  const statusFilter = many(sp.status);
  const q = one(sp.q)?.slice(0, 200);
  const page = Math.min(Math.max(Number(one(sp.page) ?? 0) || 0, 0), 20);

  const db = await createServerSupabase();
  const [posts, categories] = await Promise.all([
    listPosts(db, {
      boardId: board.id,
      sort,
      statuses: statusFilter,
      q,
      limit: (page + 1) * PAGE_SIZE,
    }),
    listCategories(db, board.id),
  ]);
  const myVotes = await getMyVotes(
    db,
    posts.map((p) => p.id),
  );
  const anon = anonFor(portal, board);
  const statusById = new Map(portal.statuses.map((s) => [s.id, s]));
  const canPost = board.allow_new_posts || Boolean(portal.viewer?.staff);
  const hasMore = posts.length === (page + 1) * PAGE_SIZE;
  const moreParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const item of many(v)) if (k !== "page") moreParams.append(k, item);
  }
  moreParams.set("page", String(page + 1));

  return (
    <PortalShell
      portal={portal}
      activeBoardSlug={board.slug}
      canCreate={canPost}
    >
      <div className="grid gap-8 md:grid-cols-[minmax(0,14rem)_1fr] lg:grid-cols-[18.75rem_1fr]">
        <aside className="hidden md:block">
          <BoardsSidebar boards={portal.boards} activeSlug={board.slug} />
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-xl font-bold tracking-tight lg:text-2xl">
              {board.name}
            </h1>
            {board.description ? (
              <p className="text-muted-foreground text-sm">
                {board.description}
              </p>
            ) : null}
          </header>

          {canPost ? (
            <div className="hidden md:block">
              <CreatePostForm
                board={{ id: board.id, slug: board.slug, name: board.name }}
                form={formOf(board)}
                categories={categories}
                statuses={portal.statuses}
                anonPosts={anon.posts}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SortFilterMenu statuses={portal.statuses} />
            <div className="hidden md:block">
              <BoardSearch />
            </div>
          </div>

          {posts.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LightbulbIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {q || statusFilter.length
                    ? "No matching posts"
                    : "No posts yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {q || statusFilter.length
                    ? "Try another search or clear the filters."
                    : "Be the first to share an idea."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y">
              {posts.map((p) => (
                <PostRow
                  key={p.id}
                  post={p}
                  href={`/feedback/${board.slug}/p/${p.slug}`}
                  status={p.status_id ? statusById.get(p.status_id) : undefined}
                  voted={myVotes.has(p.id)}
                  anonVotes={anon.votes}
                  showVoteCounts={board.show_vote_counts}
                />
              ))}
            </ul>
          )}

          {hasMore ? (
            <Button asChild variant="outline" className="self-center">
              <Link href={`?${moreParams.toString()}`} scroll={false}>
                Load more
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </PortalShell>
  );
}
