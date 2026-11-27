import Link from "next/link";
import { MapIcon } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@acme/ui/empty";

import { getMyVotes, listRoadmapPosts } from "../data";
import { RoadmapFilters } from "../web/components/roadmap-filters";
import { StatusDotLabel } from "../web/components/status-badge";
import { VoteButton } from "../web/components/vote-button";
import { anonFor, loadPortal } from "./portal-data";
import { PortalShell } from "./portal-shell";

export const metadata = { title: "Roadmap" };

const monthFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  year: "numeric",
});

/**
 * The public roadmap (Canny): "Boards" cards with post counts, then
 * "Roadmap" + Filters, then one column per roadmap status (Settings →
 * Statuses → Roadmap column) — 3–4 equal columns from `md`, stacked and
 * individually scrolling on phones. Cards: vote box on the left, title,
 * board name in uppercase; newest status change first.
 */
export async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const portal = await loadPortal();
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const hidden = new Set((one(sp.hide) ?? "").split(",").filter(Boolean));
  const showUncategorized = one(sp.uncategorized) !== "0";

  const homeBoards = portal.boards.filter((b) => b.show_on_portal_home);
  const boardIds = homeBoards.filter((b) => !hidden.has(b.id)).map((b) => b.id);
  const columns = portal.statuses.filter((s) => s.show_on_roadmap);
  const posts =
    boardIds.length && columns.length
      ? await listRoadmapPosts(
          portal.db,
          columns.map((c) => c.id),
          boardIds,
        )
      : [];
  const visible = showUncategorized
    ? posts
    : posts.filter((p) => p.category_id);
  const myVotes = await getMyVotes(
    portal.db,
    visible.map((p) => p.id),
  );
  const boardById = new Map(portal.boards.map((b) => [b.id, b]));

  return (
    <PortalShell portal={portal}>
      <div className="flex flex-col gap-10">
        {homeBoards.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h1 className="text-lg font-bold">Boards</h1>
            <div className="grid gap-3 md:grid-cols-3 md:gap-5">
              {homeBoards.map((b) => (
                <Link
                  key={b.id}
                  href={`/feedback/${b.slug}`}
                  className="hover:border-foreground/30 flex h-12 items-center justify-between gap-2 rounded-lg border px-4 text-sm font-medium transition-colors"
                >
                  <span className="truncate">{b.name}</span>
                  <Badge variant="secondary" className="tabular-nums">
                    {b.post_count}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Roadmap</h2>
            <RoadmapFilters
              boards={homeBoards.map((b) => ({ id: b.id, name: b.name }))}
            />
          </div>
          {columns.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MapIcon />
                </EmptyMedia>
                <EmptyTitle>No roadmap yet</EmptyTitle>
                <EmptyDescription>Check back soon.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div
              className="grid gap-4 md:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
              style={{ "--cols": columns.length } as React.CSSProperties}
            >
              {columns.map((col) => {
                const colPosts = visible.filter((p) => p.status_id === col.id);
                return (
                  <Card key={col.id} variant="framed" className="min-w-0">
                    <CardHeader>
                      <CardTitle>
                        <StatusDotLabel status={col} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="max-h-[30rem] overflow-y-auto py-2 md:max-h-[40rem]">
                      {colPosts.length === 0 ? (
                        <p className="text-muted-foreground py-3 text-sm">
                          Nothing here yet.
                        </p>
                      ) : (
                        <ul className="flex flex-col">
                          {colPosts.map((p) => {
                            const board = boardById.get(p.board_id);
                            if (!board) return null;
                            return (
                              <li
                                key={p.id}
                                className="flex items-start gap-3 py-2.5"
                              >
                                <VoteButton
                                  postId={p.id}
                                  votes={p.vote_count}
                                  voted={myVotes.has(p.id)}
                                  anonAllowed={anonFor(portal, board).votes}
                                  showCount={board.show_vote_counts}
                                />
                                <Link
                                  href={`/feedback/${board.slug}/p/${p.slug}`}
                                  className="group min-w-0 flex-1"
                                >
                                  <p className="group-hover:text-primary text-sm leading-snug font-medium">
                                    {p.title}
                                  </p>
                                  <p className="text-muted-foreground mt-1 text-xs font-medium tracking-wide uppercase">
                                    {board.name}
                                    {p.eta && p.eta_public
                                      ? ` · ETA ${monthFmt.format(new Date(p.eta))}`
                                      : ""}
                                  </p>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PortalShell>
  );
}
