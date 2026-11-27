"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, HeartIcon, LockIcon, PinIcon } from "lucide-react";
import { toast } from "sonner";

import { useCaptcha } from "@acme/app";
import { cn } from "@acme/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@acme/ui/avatar";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { Label } from "@acme/ui/label";
import { Switch } from "@acme/ui/switch";
import { Textarea } from "@acme/ui/textarea";

import type { FeedEntry } from "../../shared/feed";
import {
  isAuthRequired,
  useCreateComment,
  useReaction,
  useUpdateComment,
} from "../../hooks/use-feedback";
import { useAuthPrompt } from "./auth-prompt";
import { StatusBadge } from "./status-badge";

export interface FeedPerson {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_staff: boolean;
}

export type { FeedEntry } from "../../shared/feed";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
  year: "numeric",
});

function initials(name: string | null | undefined) {
  return (name ?? "?").trim().charAt(0).toUpperCase() || "?";
}

export function PersonLockup({
  person,
  fallbackName = "Someone",
}: {
  person?: FeedPerson;
  fallbackName?: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar className="size-7">
        {person?.avatar_url ? (
          <AvatarImage src={person.avatar_url} alt="" />
        ) : null}
        <AvatarFallback className="text-xs">
          {initials(person?.display_name ?? fallbackName)}
        </AvatarFallback>
      </Avatar>
      <span
        className={cn(
          "truncate text-sm font-semibold",
          person?.is_staff && "text-primary",
        )}
      >
        {person?.display_name ?? fallbackName}
      </span>
      {person?.is_staff ? (
        <Badge variant="info" className="h-4 px-1.5 text-[10px]">
          Team
        </Badge>
      ) : null}
    </span>
  );
}

/**
 * The post's activity (Canny): comments and status changes in one timeline,
 * each with a like reaction, the date and Reply; replies indent one level.
 * "Newest first ▾" flips the order. Staff see internal notes (locked) and can
 * pin or remove comments.
 */
export function ActivityFeed({
  postId,
  entries,
  people,
  reactions,
  staff,
  showDates,
  anonComments,
  anonVotes,
  commentsOpen,
}: {
  postId: string;
  entries: FeedEntry[];
  people: Record<string, FeedPerson>;
  reactions: Record<string, { likes: number; mine: boolean }>;
  staff: boolean;
  showDates: boolean;
  anonComments: boolean;
  anonVotes: boolean;
  commentsOpen: boolean;
}) {
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const { roots, replies } = useMemo(() => {
    const roots = entries.filter((e) => e.kind === "status" || !e.parentId);
    const replies = new Map<string, FeedEntry[]>();
    for (const e of entries) {
      if (e.kind === "comment" && e.parentId) {
        const list = replies.get(e.parentId) ?? [];
        list.push(e);
        replies.set(e.parentId, list);
      }
    }
    const sorted = [...roots].sort((a, b) => {
      const pin =
        Number(b.kind === "comment" && b.pinned) -
        Number(a.kind === "comment" && a.pinned);
      if (pin) return pin;
      return order === "newest"
        ? b.at.localeCompare(a.at)
        : a.at.localeCompare(b.at);
    });
    return { roots: sorted, replies };
  }, [entries, order]);

  return (
    <section aria-label="Activity" className="flex flex-col gap-4">
      {commentsOpen ? (
        <CommentComposer
          postId={postId}
          staff={staff}
          anonAllowed={anonComments}
        />
      ) : (
        <p className="text-muted-foreground rounded-md border p-3 text-sm">
          Comments are closed on this post.
        </p>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Activity</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              {order === "newest" ? "Newest first" : "Oldest first"}
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setOrder("newest")}>
              Newest first
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOrder("oldest")}>
              Oldest first
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {roots.length === 0 ? (
        <p className="text-muted-foreground text-sm">No comments yet.</p>
      ) : (
        <ol className="flex flex-col gap-5">
          {roots.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-3">
              <Entry
                entry={entry}
                postId={postId}
                people={people}
                reaction={reactions[entry.id]}
                staff={staff}
                showDates={showDates}
                anonVotes={anonVotes}
                onReply={commentsOpen ? () => setReplyTo(entry.id) : undefined}
              />
              {entry.kind === "comment" ? (
                <div className="ml-9 flex flex-col gap-3 border-l pl-4">
                  {(replies.get(entry.id) ?? []).map((r) => (
                    <Entry
                      key={r.id}
                      entry={r}
                      postId={postId}
                      people={people}
                      reaction={reactions[r.id]}
                      staff={staff}
                      showDates={showDates}
                      anonVotes={anonVotes}
                      onReply={
                        commentsOpen ? () => setReplyTo(entry.id) : undefined
                      }
                    />
                  ))}
                  {replyTo === entry.id ? (
                    <CommentComposer
                      postId={postId}
                      parentId={entry.id}
                      staff={staff}
                      anonAllowed={anonComments}
                      autoFocus
                      onDone={() => setReplyTo(null)}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Entry({
  entry,
  postId,
  people,
  reaction,
  staff,
  showDates,
  anonVotes,
  onReply,
}: {
  entry: FeedEntry;
  postId: string;
  people: Record<string, FeedPerson>;
  reaction?: { likes: number; mine: boolean };
  staff: boolean;
  showDates: boolean;
  anonVotes: boolean;
  onReply?: () => void;
}) {
  const person = entry.authorId ? people[entry.authorId] : undefined;
  const update = useUpdateComment();
  const router = useRouter();

  return (
    <article
      className={cn(
        "flex flex-col gap-1.5",
        entry.kind === "comment" &&
          entry.internal &&
          "bg-warning-subtle/40 -mx-2 rounded-md px-2 py-1.5",
      )}
    >
      {entry.kind === "status" ? (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <PersonLockup person={person} fallbackName="The team" />
          <span>updated the status to</span>
          {entry.toStatus ? (
            <StatusBadge status={entry.toStatus} />
          ) : (
            <span>—</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <PersonLockup person={person} />
          {entry.internal ? (
            <span className="text-warning flex items-center gap-1 text-xs">
              <LockIcon className="size-3" aria-hidden />
              Internal note
            </span>
          ) : null}
          {entry.pinned ? (
            <PinIcon
              className="text-muted-foreground size-3.5"
              aria-label="Pinned"
            />
          ) : null}
        </div>
      )}
      {entry.kind === "comment" ? (
        <p className="ml-9 text-sm whitespace-pre-wrap">{entry.body}</p>
      ) : entry.message ? (
        <p className="ml-9 text-sm whitespace-pre-wrap">{entry.message}</p>
      ) : null}
      <div className="text-muted-foreground ml-9 flex flex-wrap items-center gap-1.5 text-xs">
        <LikeButton
          postId={postId}
          targetType={entry.kind === "comment" ? "comment" : "status_change"}
          targetId={entry.id}
          likes={reaction?.likes ?? 0}
          mine={reaction?.mine ?? false}
          anonAllowed={anonVotes}
        />
        {showDates ? (
          <>
            <span aria-hidden>·</span>
            <time dateTime={entry.at}>
              {dateFmt.format(new Date(entry.at))}
            </time>
          </>
        ) : null}
        {onReply && entry.kind === "comment" ? (
          <>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={onReply}
            >
              Reply
            </button>
          </>
        ) : null}
        {entry.kind === "comment" && entry.edited ? (
          <>
            <span aria-hidden>·</span>
            <span>edited</span>
          </>
        ) : null}
        {staff && entry.kind === "comment" ? (
          <>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() =>
                update.mutate(
                  { commentId: entry.id, pinned: !entry.pinned },
                  { onSuccess: () => router.refresh() },
                )
              }
            >
              {entry.pinned ? "Unpin" : "Pin"}
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="hover:text-destructive"
              onClick={() =>
                update.mutate(
                  { commentId: entry.id, deleted: true },
                  {
                    onSuccess: () => {
                      toast.success("Comment removed");
                      router.refresh();
                    },
                  },
                )
              }
            >
              Remove
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

function LikeButton({
  postId,
  targetType,
  targetId,
  likes,
  mine,
  anonAllowed,
}: {
  postId: string;
  targetType: "comment" | "status_change";
  targetId: string;
  likes: number;
  mine: boolean;
  anonAllowed: boolean;
}) {
  const router = useRouter();
  const react = useReaction();
  const prompt = useAuthPrompt();
  const { token, reset } = useCaptcha();
  const [state, setState] = useState({ likes, mine });

  return (
    <button
      type="button"
      aria-pressed={state.mine}
      onClick={() => {
        const next = {
          likes: state.likes + (state.mine ? -1 : 1),
          mine: !state.mine,
        };
        const before = state;
        setState(next);
        react.mutate(
          {
            postId,
            targetType,
            targetId,
            liked: next.mine,
            anonAllowed,
            captchaToken: token,
          },
          {
            onSuccess: () => router.refresh(),
            onError: (err) => {
              setState(before);
              if (isAuthRequired(err)) prompt.open("vote");
              else toast.error(err.message);
            },
            onSettled: () => reset(),
          },
        );
      }}
      className={cn(
        "hover:text-foreground flex items-center gap-1",
        state.mine && "text-destructive",
      )}
    >
      <HeartIcon
        className={cn("size-3.5", state.mine && "fill-current")}
        aria-hidden
      />
      {state.likes > 0 ? (
        <span className="tabular-nums">
          {state.likes} {state.likes === 1 ? "like" : "likes"}
        </span>
      ) : (
        <span className="sr-only">Like</span>
      )}
    </button>
  );
}

/** "Leave a comment" — focusing it reveals Submit (and, for staff, Internal). */
export function CommentComposer({
  postId,
  parentId,
  staff,
  anonAllowed,
  autoFocus,
  onDone,
}: {
  postId: string;
  parentId?: string;
  staff: boolean;
  anonAllowed: boolean;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const create = useCreateComment();
  const prompt = useAuthPrompt();
  const { token, reset } = useCaptcha();
  const [body, setBody] = useState("");
  const [focused, setFocused] = useState(Boolean(autoFocus));
  const [internal, setInternal] = useState(false);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            postId,
            body,
            parentId: parentId ?? null,
            internal,
            anonAllowed,
            captchaToken: token,
          },
          {
            onSuccess: () => {
              setBody("");
              setFocused(false);
              setInternal(false);
              onDone?.();
              router.refresh();
            },
            onError: (err) => {
              if (isAuthRequired(err)) prompt.open("comment");
              else toast.error(err.message);
            },
            onSettled: () => reset(),
          },
        );
      }}
    >
      <Textarea
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder={parentId ? "Write a reply" : "Leave a comment"}
        aria-label={parentId ? "Write a reply" : "Leave a comment"}
        maxLength={5000}
        rows={focused ? 3 : 1}
        className="field-sizing-content min-h-9"
      />
      {focused ? (
        <div className="flex items-center justify-end gap-3">
          {staff ? (
            <div className="mr-auto flex items-center gap-2">
              <Switch
                id={`internal-${parentId ?? "root"}`}
                checked={internal}
                onCheckedChange={setInternal}
              />
              <Label
                htmlFor={`internal-${parentId ?? "root"}`}
                className="text-xs"
              >
                Internal note
              </Label>
            </div>
          ) : null}
          {onDone ? (
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={create.isPending || !body.trim()}
          >
            {create.isPending ? "Sending…" : "Submit"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
