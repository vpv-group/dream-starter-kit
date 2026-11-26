"use client";

import Link from "next/link";
import { LightbulbIcon, MegaphoneIcon } from "lucide-react";

import { Button } from "@acme/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";
import { Separator } from "@acme/ui/separator";
import { Skeleton } from "@acme/ui/skeleton";

import { useBoardPosts, useBoards, useWhatsNew } from "../hooks/use-feedback";

/**
 * Dashboard widget: "What's new" (latest changelog entries, with a dot on
 * unread ones) and what people are asking for right now.
 */
export function FeedbackWidget() {
  const posts = useBoardPosts({ sort: "trending", page: 0 });
  const boards = useBoards();
  const news = useWhatsNew();
  const slugOf = new Map((boards.data ?? []).map((b) => [b.id, b.slug]));

  return (
    <Card variant="framed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MegaphoneIcon className="size-4" aria-hidden />
          What&apos;s new
          {news.data?.unread ? (
            <span
              className="bg-primary size-2 rounded-full"
              aria-label={`${news.data.unread} unread`}
            />
          ) : null}
        </CardTitle>
        <CardAction>
          <Button asChild size="sm" variant="outline">
            <Link href="/feedback">Give feedback</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 py-3">
        {news.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (news.data?.entries ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">No updates yet.</p>
        ) : (
          news.data?.entries.slice(0, 3).map((e) => (
            <Link
              key={e.id}
              href={`/changelog/${e.slug}`}
              className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              <span
                aria-hidden
                className={
                  e.unread ? "bg-primary size-1.5 rounded-full" : "size-1.5"
                }
              />
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
            </Link>
          ))
        )}
        <Separator className="my-2" />
        <p className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs font-medium uppercase">
          <LightbulbIcon className="size-3.5" aria-hidden />
          Trending feedback
        </p>
        {posts.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (posts.data ?? []).length === 0 ? (
          <p className="text-muted-foreground px-2 text-sm">
            No feedback yet — be the first.
          </p>
        ) : (
          (posts.data ?? []).slice(0, 4).map((p) => (
            <Link
              key={p.id}
              href={`/feedback/${slugOf.get(p.board_id) ?? ""}/p/${p.slug}`}
              className="hover:bg-muted flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              <span className="w-8 text-right font-semibold tabular-nums">
                {p.vote_count}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
