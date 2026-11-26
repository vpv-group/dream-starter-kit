"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BotIcon,
  CopyIcon,
  KeyRoundIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@acme/ui/alert";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";
import { Checkbox } from "@acme/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import { Skeleton } from "@acme/ui/skeleton";

import type { AutopilotPayload, InboxItem } from "../hooks/use-feedback";
import {
  useApiKeys,
  useAutopilot,
  useBoards,
  useDraftChangelog,
  useResolveInbox,
  useRotateApiKey,
  useStaffIdeas,
  useSummarize,
  useUnmergePost,
} from "../hooks/use-feedback";

const pct = (n: number | null) => (n === null ? "" : `${Math.round(n * 100)}%`);

/** Inbox → Autopilot: duplicate suggestions, extracted feedback, audit log. */
export function AutopilotInbox() {
  const ap = useAutopilot();
  const boards = useBoards();
  const resolve = useResolveInbox();
  const unmerge = useUnmergePost();
  if (ap.isLoading) return <Skeleton className="h-32 w-full" />;
  const data = ap.data;
  if (!data) return null;
  const slug = new Map((boards.data ?? []).map((b) => [b.id, b.slug]));
  const postById = new Map(data.posts.map((p) => [p.id, p]));
  const link = (id: string | null) => {
    const p = id ? postById.get(id) : undefined;
    return p ? (
      <Link
        href={`/feedback/${slug.get(p.board_id) ?? ""}/p/${p.slug}`}
        className="font-medium hover:underline"
      >
        {p.title}
      </Link>
    ) : (
      <span className="text-muted-foreground">a post</span>
    );
  };
  const pending = data.items.filter((i) => i.state === "pending");
  // Autopilot's own merges have no staff resolver; they can be undone.
  const automated = data.items
    .filter(
      (i) => i.kind === "duplicate" && i.state === "merged" && !i.resolved_by,
    )
    .slice(0, 10);
  const act = (
    item: InboxItem,
    action: "accept" | "merge" | "dismiss",
    done: string,
  ) =>
    resolve.mutate(
      { id: item.id, action },
      {
        onSuccess: () => toast.success(done),
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <Card variant="framed" className="@4xl/main:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BotIcon className="size-4" aria-hidden />
          Autopilot ({pending.length})
        </CardTitle>
        <CardAction>
          <Badge variant={data.actions === "automated" ? "info" : "neutral"}>
            {data.actions === "automated" ? "Automated" : "Manual review"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 py-3">
        {!data.aiConfigured ? (
          <Alert>
            <AlertTitle>AI isn&apos;t configured</AlertTitle>
            <AlertDescription>
              Set AI_GATEWAY_API_KEY to turn on duplicate detection,
              categorizing, summaries and changelog drafts. Feedback from the
              inbound API still lands here.
            </AlertDescription>
          </Alert>
        ) : null}
        {pending.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing waiting for review.
          </p>
        ) : (
          pending.map((item) =>
            item.kind === "duplicate" ? (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {link(item.post_id)} looks like {link(item.suggested_post_id)}
                </span>
                <Badge variant="neutral">{pct(item.confidence)} similar</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => act(item, "merge", "Merged")}
                >
                  Merge
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => act(item, "accept", "Kept both")}
                >
                  Not a duplicate
                </Button>
              </div>
            ) : (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-md border p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">{item.source}</Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {item.title ?? "Feedback"}
                  </span>
                  {item.author_email ? (
                    <span className="text-muted-foreground text-xs">
                      {item.author_email}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground line-clamp-3">
                  {item.raw_text}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {item.suggested_post_id ? (
                    <>
                      <span className="text-muted-foreground mr-auto text-xs">
                        Matches {link(item.suggested_post_id)} (
                        {pct(item.confidence)})
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act(item, "merge", "Added to the post")}
                      >
                        Add to that post
                      </Button>
                    </>
                  ) : (
                    <span className="mr-auto" />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => act(item, "accept", "Post created")}
                  >
                    Create post
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act(item, "dismiss", "Dismissed")}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ),
          )
        )}
        {automated.length ? (
          <>
            <p className="text-muted-foreground pt-2 text-xs font-medium uppercase">
              Merged by Autopilot
            </p>
            {automated.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {link(item.post_id)} → {link(item.suggested_post_id)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    item.post_id &&
                    unmerge.mutate(
                      { sourceId: item.post_id },
                      {
                        onSuccess: () => toast.success("Unmerged"),
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  <Undo2Icon />
                  Undo
                </Button>
              </div>
            ))}
          </>
        ) : null}
        <InboundApi />
      </CardContent>
    </Card>
  );
}

function InboundApi() {
  const keys = useApiKeys();
  const rotate = useRotateApiKey();
  const [shown, setShown] = useState<string | null>(null);
  const active = (keys.data ?? []).find((k) => !k.revoked_at);
  const endpoint =
    typeof window === "undefined"
      ? "/api/mod/feedback/ingest"
      : `${window.location.origin}/api/mod/feedback/ingest`;
  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3 text-sm">
      <div className="flex items-center gap-2">
        <KeyRoundIcon className="text-muted-foreground size-4" aria-hidden />
        <span className="mr-auto">
          Inbound API{" "}
          <span className="text-muted-foreground">
            {active ? `· key ${active.prefix}…` : "· no key yet"}
          </span>
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            rotate.mutate(undefined, {
              onSuccess: (r) => setShown(r.key),
              onError: (e) => toast.error(e.message),
            })
          }
        >
          {active ? "Rotate key" : "Create key"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Send feedback from support tools or Zapier: POST {endpoint} with{" "}
        <code>Authorization: Bearer fbk_…</code> and JSON{" "}
        <code>{`{ "text", "title?", "email?", "name?", "source?" }`}</code>. It
        lands here for review.
      </p>
      <Dialog open={Boolean(shown)} onOpenChange={(o) => !o && setShown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy it now — it won&apos;t be shown again. The old key stopped
              working.
            </DialogDescription>
          </DialogHeader>
          <code className="bg-muted rounded-md p-3 text-xs break-all">
            {shown}
          </code>
          <DialogFooter>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(shown ?? "");
                toast.success("Copied");
              }}
            >
              <CopyIcon />
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "Draft with AI": pick shipped ideas, get a Payload draft to edit. */
export function DraftWithAiButton() {
  const ideas = useStaffIdeas();
  const draft = useDraftChangelog();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const done = new Set(
    (ideas.data?.stages ?? [])
      .filter((s) => s.type === "complete")
      .map((s) => s.id),
  );
  const candidates = (ideas.data?.ideas ?? []).filter(
    (i) => i.stage_id && done.has(i.stage_id),
  );
  const pool = candidates.length ? candidates : (ideas.data?.ideas ?? []);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <SparklesIcon />
        Draft with AI
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Draft a changelog entry</DialogTitle>
            <DialogDescription>
              Pick the ideas it announces. You&apos;ll get a draft in /admin to
              edit before publishing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {pool.map((i) => (
              <label key={i.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.has(i.id)}
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    if (v === true) next.add(i.id);
                    else next.delete(i.id);
                    setSelected(next);
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {i.vote_total} votes
                </span>
              </label>
            ))}
            {pool.length === 0 ? (
              <p className="text-muted-foreground text-sm">No ideas yet.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              disabled={!selected.size || draft.isPending}
              onClick={() =>
                draft.mutate(
                  { ideaIds: [...selected] },
                  {
                    onSuccess: (r) => {
                      toast.success("Draft created");
                      window.location.href = `/admin/collections/mod-feedback-changelog/${r.id}`;
                    },
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              {draft.isPending ? "Writing…" : "Create draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Staff-only AI summary of a post's discussion. */
export function AiSummary({
  postId,
  initial,
}: {
  postId: string;
  initial: string | null;
}) {
  const summarize = useSummarize();
  const [summary, setSummary] = useState(initial);
  return (
    <Card variant="framed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4" aria-hidden />
          Discussion summary
        </CardTitle>
        <CardAction>
          <Button
            size="sm"
            variant="ghost"
            disabled={summarize.isPending}
            onClick={() =>
              summarize.mutate(
                { postId },
                {
                  onSuccess: (r) => setSummary(r.summary),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {summarize.isPending
              ? "Summarizing…"
              : summary
                ? "Refresh"
                : "Summarize"}
          </Button>
        </CardAction>
      </CardHeader>
      {summary ? (
        <CardContent className="py-3 text-sm whitespace-pre-wrap">
          {summary}
        </CardContent>
      ) : null}
    </Card>
  );
}

export type { AutopilotPayload };
