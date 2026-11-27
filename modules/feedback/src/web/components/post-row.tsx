import Link from "next/link";
import { MessageSquareIcon, PinIcon } from "lucide-react";

import type { Post, StatusLite } from "../../data";
import { StatusBadge } from "./status-badge";
import { VoteButton } from "./vote-button";

/**
 * One post in a board list (Canny V2 row): title, two-line details, comment
 * count; the vote box sits on the RIGHT. A status badge is shown unless the
 * post is still in the default status.
 */
export function PostRow({
  post,
  href,
  status,
  voted,
  anonVotes,
  showVoteCounts,
  boardName,
}: {
  post: Post;
  href: string;
  status?: StatusLite;
  voted: boolean;
  anonVotes: boolean;
  showVoteCounts: boolean;
  boardName?: string;
}) {
  return (
    <li className="group flex items-start gap-4 py-4">
      <Link href={href} className="min-w-0 flex-1 space-y-1">
        <p className="group-hover:text-primary flex items-center gap-1.5 leading-snug font-semibold">
          {post.pinned ? (
            <PinIcon
              className="text-muted-foreground size-3.5 shrink-0"
              aria-label="Pinned"
            />
          ) : null}
          <span className="line-clamp-2">{post.title}</span>
        </p>
        {post.details ? (
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {post.details}
          </p>
        ) : null}
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 pt-1 text-xs">
          {status && !status.is_default ? (
            <StatusBadge status={status} />
          ) : null}
          {boardName ? (
            <span className="font-medium tracking-wide uppercase">
              {boardName}
            </span>
          ) : null}
          <span className="flex items-center gap-1.5">
            <MessageSquareIcon className="size-3" aria-hidden />
            <span className="tabular-nums">{post.comment_count}</span>
            <span className="sr-only">comments</span>
          </span>
        </div>
      </Link>
      <VoteButton
        postId={post.id}
        votes={post.vote_count}
        voted={voted}
        anonAllowed={anonVotes}
        showCount={showVoteCounts}
      />
    </li>
  );
}
