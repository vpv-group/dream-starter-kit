"use client";

import Link from "next/link";
import { LightbulbIcon } from "lucide-react";

import { Button } from "@acme/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";
import { Skeleton } from "@acme/ui/skeleton";

import { useBoardPosts, useBoards } from "../hooks/use-feedback";

/** Dashboard widget: what people are asking for right now + "Give feedback". */
export function FeedbackWidget() {
  const posts = useBoardPosts({ sort: "trending", page: 0 });
  const boards = useBoards();
  const slugOf = new Map((boards.data ?? []).map((b) => [b.id, b.slug]));

  return (
    <Card variant="framed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LightbulbIcon className="size-4" aria-hidden />
          Trending feedback
        </CardTitle>
        <CardAction>
          <Button asChild size="sm" variant="outline">
            <Link href="/feedback">Give feedback</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 py-3">
        {posts.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (posts.data ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No feedback yet — be the first.
          </p>
        ) : (
          (posts.data ?? []).slice(0, 5).map((p) => (
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
