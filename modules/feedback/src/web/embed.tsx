"use client";

import type { Session } from "@supabase/supabase-js";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useSupabase } from "@acme/api";
import { signInWithOtp, useCaptcha, verifyEmailLoginCode } from "@acme/app";
import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import { Skeleton } from "@acme/ui/skeleton";
import { Textarea } from "@acme/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@acme/ui/toggle-group";

import type { PortalConfig } from "../hooks/use-feedback";
import type { Sort } from "../shared/config";
import {
  feedbackApi,
  feedbackKeys,
  isAuthRequired,
  useBoardPosts,
  useCreatePost,
  useFeedbackConfig,
  useMyVotes,
  usePost,
  usePostFeed,
  useRoadmapPosts,
  useStatuses,
  useWhatsNew,
} from "../hooks/use-feedback";
import { boardAnon, feedEntries } from "../shared/feed";
import { ActivityFeed } from "./components/activity-feed";
import { AuthPromptContext, useAuthPrompt } from "./components/auth-prompt";
import { StatusBadge } from "./components/status-badge";
import { VoteButton } from "./components/vote-button";

/**
 * The feedback widget: compact pages for an iframe on another site
 * (/embed/feedback…, the kit's bare embed layout with its own localStorage
 * session). Feedback, roadmap and changelog tabs; the frame reports its
 * height to the loader script (embed.js) so it never scrolls inside.
 * Sign-in inside the frame is by email code for existing accounts; new
 * accounts sign up on the portal (keeps the sign-up rules in one place).
 */

type Tab = "feedback" | "roadmap" | "changelog";

function useEmbedQuery() {
  const params = useSearchParams();
  const board = params.get("board");
  const theme = params.get("theme");
  const panel = params.get("panel") === "1";
  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (board) q.set("board", board);
    if (theme) q.set("theme", theme);
    if (panel) q.set("panel", "1");
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [board, theme, panel]);
  return { board, theme, panel, query };
}

/** Report our height to the parent page (embed.js resizes the iframe). */
function useReportHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    // Measure our own content, not the document: the root layout's body is
    // `min-h-screen`, so the document is never shorter than the iframe and
    // the frame could only ever grow.
    const root = document.querySelector<HTMLElement>("[data-embed-root]");
    if (!root) return;
    let last = 0;
    const send = () => {
      const h = Math.ceil(root.getBoundingClientRect().height);
      if (Math.abs(h - last) < 2) return;
      last = h;
      // Height only — nothing private — so any parent may read it.
      window.parent.postMessage(
        { type: "dream-feedback:resize", height: h },
        "*",
      );
    };
    const ro = new ResizeObserver(send);
    ro.observe(root);
    send();
    return () => ro.disconnect();
  }, []);
}

function useForcedTheme(theme: string | null) {
  useEffect(() => {
    if (theme !== "dark" && theme !== "light") return;
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    root.style.colorScheme = theme;
  }, [theme]);
}

function useSession() {
  const supabase = useSupabase();
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);
  return session;
}

function EmbedFrame({
  tab,
  children,
}: {
  tab: Tab;
  children: (config: PortalConfig) => React.ReactNode;
}) {
  const { theme, panel, query } = useEmbedQuery();
  const config = useFeedbackConfig();
  const supabase = useSupabase();
  const qc = useQueryClient();
  const session = useSession();
  const [signIn, setSignIn] = useState(false);
  useReportHeight();
  useForcedTheme(theme);
  const prompt = useMemo(() => ({ open: () => setSignIn(true) }), []);

  const tabs = config.data?.tabs ?? [];
  const portalHref =
    tab === "roadmap"
      ? "/roadmap"
      : tab === "changelog"
        ? "/changelog"
        : "/feedback";
  const signedIn = session && !session.user.is_anonymous;

  return (
    <AuthPromptContext.Provider value={prompt}>
      <div
        data-embed-root
        className={cn("flex flex-col gap-4 p-4", panel && "pt-12")}
      >
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <nav className="flex items-center gap-1" aria-label="Feedback">
            {tabs.map((t) => (
              <Link
                key={t.tab}
                href={`/embed/feedback${t.tab === "feedback" ? "" : `/${t.tab}`}${query}`}
                aria-current={t.tab === tab ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm font-medium",
                  t.tab === tab
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {signedIn ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void supabase.auth
                    .signOut()
                    .then(() => qc.invalidateQueries())
                }
                title={session.user.email ?? undefined}
              >
                Sign out
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setSignIn(true)}>
                Log in
              </Button>
            )}
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Open in a new tab"
            >
              <a href={portalHref} target="_blank" rel="noopener">
                <ExternalLinkIcon />
              </a>
            </Button>
          </div>
        </header>
        {config.data ? (
          children(config.data)
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
      </div>
      <SignInDialog
        open={signIn}
        onOpenChange={setSignIn}
        title={config.data?.title}
      />
    </AuthPromptContext.Provider>
  );
}

/** Email code sign-in for existing accounts, inside the frame. */
function SignInDialog({
  open,
  onOpenChange,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}) {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { token: captchaToken, reset } = useCaptcha();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signInWithOtp(supabase, email.trim(), {
        captchaToken,
        shouldCreateUser: false,
      });
      setSent(true);
    } catch (err) {
      toast.error(
        (err as Error).message.includes("not allowed")
          ? "No account with that email yet. Sign up on the portal first."
          : (err as Error).message,
      );
    } finally {
      reset();
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: before } = await supabase.auth.getSession();
      const anonToken = before.session?.user.is_anonymous
        ? before.session.access_token
        : null;
      await verifyEmailLoginCode(supabase, email.trim(), code.trim());
      // Bring along anything voted/posted anonymously in this frame, and
      // make sure the account appears in /admin → Users.
      if (anonToken) {
        await feedbackApi(supabase, "/claim-anon", {
          body: { anonToken },
        }).catch(() => undefined);
      }
      const { data: after } = await supabase.auth.getSession();
      if (after.session) {
        void fetch("/api/cms/mirror-self", {
          method: "POST",
          headers: { Authorization: `Bearer ${after.session.access_token}` },
        }).catch(() => undefined);
      }
      await qc.invalidateQueries({ queryKey: feedbackKeys.all });
      toast.success("You're signed in");
      onOpenChange(false);
      setSent(false);
      setCode("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log in{title ? ` to ${title}` : ""}</DialogTitle>
          <DialogDescription>
            {sent
              ? `We emailed a 6-digit code to ${email}.`
              : "We'll email you a code. No password needed."}
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <Label htmlFor="embed-code">Code</Label>
            <Input
              id="embed-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              minLength={6}
              maxLength={10}
              autoFocus
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Checking…" : "Log in"}
            </Button>
            <Button type="button" variant="link" onClick={() => setSent(false)}>
              Use a different email
            </Button>
          </form>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-3">
            <Label htmlFor="embed-email">Email</Label>
            <Input
              id="embed-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Email me a code"}
            </Button>
            <p className="text-muted-foreground text-center text-sm">
              No account?{" "}
              <a
                href="/sign-up"
                target="_blank"
                rel="noopener"
                className="text-foreground font-medium underline-offset-4 hover:underline"
              >
                Sign up
              </a>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Feedback (board list + create)
// ---------------------------------------------------------------------------

function FeedbackList({ config }: { config: PortalConfig }) {
  const router = useRouter();
  const { board: boardParam, query } = useEmbedQuery();
  const boards = config.boards.filter(
    (b) => b.show_on_portal_home || b.slug === boardParam,
  );
  const [boardSlug, setBoardSlug] = useState(
    boardParam ?? boards[0]?.slug ?? "",
  );
  const board = config.boards.find((b) => b.slug === boardSlug) ?? boards[0];
  const [sort, setSort] = useState<Sort>("trending");
  const [creating, setCreating] = useState(false);
  const posts = useBoardPosts({ boardId: board?.id ?? null, sort });
  const ids = (posts.data ?? []).map((p) => p.id);
  const mine = useMyVotes(ids);
  const statuses = useStatuses();
  const statusById = new Map((statuses.data ?? []).map((s) => [s.id, s]));
  if (!board) {
    return (
      <p className="text-muted-foreground text-sm">No boards to show yet.</p>
    );
  }
  const anon = boardAnon(config.anon, board);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {boards.length > 1 ? (
          <Select value={board.slug} onValueChange={setBoardSlug}>
            <SelectTrigger className="h-8 w-auto min-w-36" aria-label="Board">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {boards.map((b) => (
                <SelectItem key={b.id} value={b.slug}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <h1 className="text-base font-semibold">{board.name}</h1>
        )}
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={sort}
          onValueChange={(v) => v && setSort(v as Sort)}
          aria-label="Sort"
        >
          <ToggleGroupItem value="trending">Trending</ToggleGroupItem>
          <ToggleGroupItem value="top">Top</ToggleGroupItem>
          <ToggleGroupItem value="new">New</ToggleGroupItem>
        </ToggleGroup>
        {board.allow_new_posts ? (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setCreating((c) => !c)}
          >
            <PlusIcon />
            New post
          </Button>
        ) : null}
      </div>
      {creating ? (
        <QuickPost
          boardId={board.id}
          anonPosts={anon.posts}
          onDone={(post) => {
            setCreating(false);
            if (post.approvalState === "pending") {
              toast.success(
                "Thanks! Your post will appear once it's approved.",
              );
            } else {
              router.push(`/embed/feedback/p/${post.id}${query}`);
            }
          }}
        />
      ) : null}
      {posts.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (posts.data ?? []).length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No posts yet. Be the first!
        </p>
      ) : (
        <ul className="divide-y">
          {(posts.data ?? []).map((p) => {
            const status = p.status_id
              ? statusById.get(p.status_id)
              : undefined;
            return (
              <li key={p.id} className="flex items-start gap-3 py-3">
                <VoteButton
                  postId={p.id}
                  votes={p.vote_count}
                  voted={mine.data?.has(p.id) ?? false}
                  anonAllowed={anon.votes}
                  showCount={board.show_vote_counts}
                />
                <Link
                  href={`/embed/feedback/p/${p.id}${query}`}
                  className="group min-w-0 flex-1 space-y-1"
                >
                  <p className="group-hover:text-primary line-clamp-2 leading-snug font-medium">
                    {p.title}
                  </p>
                  {p.details ? (
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      {p.details}
                    </p>
                  ) : null}
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    {status && !status.is_default ? (
                      <StatusBadge status={status} />
                    ) : null}
                    <span className="flex items-center gap-1">
                      <MessageSquareIcon className="size-3" aria-hidden />
                      <span className="tabular-nums">{p.comment_count}</span>
                      <span className="sr-only">comments</span>
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function QuickPost({
  boardId,
  anonPosts,
  onDone,
}: {
  boardId: string;
  anonPosts: boolean;
  onDone: (post: { id: string; approvalState: string }) => void;
}) {
  const create = useCreatePost();
  const prompt = useAuthPrompt();
  const { token, reset } = useCaptcha();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  return (
    <form
      className="bg-card flex flex-col gap-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            boardId,
            title,
            details,
            categoryId: null,
            customFields: {},
            anonAllowed: anonPosts,
            captchaToken: token,
          },
          {
            onSuccess: (post) => onDone(post),
            onError: (err) => {
              if (isAuthRequired(err)) prompt.open("post");
              else toast.error(err.message);
            },
            onSettled: () => reset(),
          },
        );
      }}
    >
      <Input
        aria-label="Title"
        placeholder="Short, descriptive title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        maxLength={200}
        autoFocus
      />
      <Textarea
        aria-label="Details"
        placeholder="Any additional details…"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={3}
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={create.isPending || !title.trim()}
        >
          {create.isPending ? "Posting…" : "Create post"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Post
// ---------------------------------------------------------------------------

function PostView({ config }: { config: PortalConfig }) {
  const { post: postId } = useParams<{ post: string }>();
  const { query } = useEmbedQuery();
  const post = usePost(postId);
  const feed = usePostFeed(postId);
  const statuses = useStatuses();
  const mine = useMyVotes(post.data ? [post.data.id] : []);
  if (post.isLoading) return <Skeleton className="h-48 w-full" />;
  const p = post.data;
  const board = p ? config.boards.find((b) => b.id === p.board_id) : undefined;
  if (!p || !board) {
    return (
      <p className="text-muted-foreground text-sm">
        This post isn&apos;t available.
      </p>
    );
  }
  const statusById = new Map((statuses.data ?? []).map((s) => [s.id, s]));
  const status = p.status_id ? statusById.get(p.status_id) : undefined;
  const anon = boardAnon(config.anon, board);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/embed/feedback${query}`}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        {board.name}
      </Link>
      <div className="flex items-start gap-3">
        <VoteButton
          postId={p.id}
          votes={p.vote_count}
          voted={mine.data?.has(p.id) ?? false}
          anonAllowed={anon.votes}
          showCount={board.show_vote_counts}
          disabled={Boolean(p.merged_into_id)}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-lg leading-snug font-semibold">{p.title}</h1>
          {status ? <StatusBadge status={status} /> : null}
        </div>
      </div>
      {p.details ? (
        <p className="text-sm whitespace-pre-wrap">{p.details}</p>
      ) : null}
      {feed.data ? (
        <ActivityFeed
          postId={p.id}
          entries={feedEntries(feed.data, statusById)}
          people={Object.fromEntries(feed.data.people)}
          reactions={Object.fromEntries(feed.data.reactions)}
          staff={false}
          showDates={board.show_dates}
          anonComments={anon.comments}
          anonVotes={anon.votes}
          commentsOpen
        />
      ) : (
        <Skeleton className="h-24 w-full" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roadmap + changelog
// ---------------------------------------------------------------------------

function RoadmapView({ config }: { config: PortalConfig }) {
  const { query } = useEmbedQuery();
  const columns = config.statuses
    .filter((s) => s.show_on_roadmap)
    .sort((a, b) => a.position - b.position);
  const posts = useRoadmapPosts(columns.map((c) => c.id));
  const ids = (posts.data ?? []).map((p) => p.id);
  const mine = useMyVotes(ids);
  const boardById = new Map(config.boards.map((b) => [b.id, b]));
  if (posts.isLoading) return <Skeleton className="h-48 w-full" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {columns.map((c) => {
        const items = (posts.data ?? []).filter((p) => p.status_id === c.id);
        return (
          <section key={c.id} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <StatusBadge status={c} />
              <span className="text-muted-foreground tabular-nums">
                {items.length}
              </span>
            </h2>
            {items.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing here yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((p) => {
                  const b = boardById.get(p.board_id);
                  return (
                    <li
                      key={p.id}
                      className="bg-card flex items-start gap-2 rounded-lg border p-2"
                    >
                      <VoteButton
                        postId={p.id}
                        votes={p.vote_count}
                        voted={mine.data?.has(p.id) ?? false}
                        anonAllowed={
                          b ? boardAnon(config.anon, b).votes : false
                        }
                        showCount={b?.show_vote_counts ?? true}
                      />
                      <Link
                        href={`/embed/feedback/p/${p.id}${query}`}
                        className="min-w-0 flex-1 text-sm leading-snug font-medium hover:underline"
                      >
                        {p.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

const TYPE_TONE: Record<string, "success" | "info" | "warning" | "neutral"> = {
  new: "success",
  improved: "info",
  fixed: "warning",
};

function ChangelogView() {
  const supabase = useSupabase();
  const news = useWhatsNew("", 20);
  useEffect(() => {
    void feedbackApi(supabase, "/changelog/seen", { body: {} }).catch(
      () => undefined,
    );
  }, [supabase]);
  if (news.isLoading) return <Skeleton className="h-48 w-full" />;
  const entries = news.data?.entries ?? [];
  if (!entries.length) {
    return <p className="text-muted-foreground text-sm">No updates yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y">
      {entries.map((e) => (
        <li key={e.slug} className="flex flex-col gap-1.5 py-3">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Badge
              variant={TYPE_TONE[e.type] ?? "neutral"}
              className="capitalize"
            >
              {e.type}
            </Badge>
            {e.publishedAt ? (
              <time dateTime={e.publishedAt}>
                {new Date(e.publishedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            ) : null}
          </div>
          <a
            href={`/changelog/${e.slug}`}
            target="_blank"
            rel="noopener"
            className="font-medium hover:underline"
          >
            {e.title}
          </a>
          {e.excerpt ? (
            <p className="text-muted-foreground text-sm">{e.excerpt}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Route components (manifest `area: "embed"`)
// ---------------------------------------------------------------------------

function page(tab: Tab, body: (config: PortalConfig) => React.ReactNode) {
  return function EmbedPage() {
    return (
      <Suspense fallback={<Skeleton className="m-4 h-64" />}>
        <EmbedFrame tab={tab}>{body}</EmbedFrame>
      </Suspense>
    );
  };
}

export const EmbedFeedbackPage = page("feedback", (config) => (
  <FeedbackList config={config} />
));
export const EmbedPostPage = page("feedback", (config) => (
  <PostView config={config} />
));
export const EmbedRoadmapPage = page("roadmap", (config) => (
  <RoadmapView config={config} />
));
export const EmbedChangelogPage = page("changelog", () => <ChangelogView />);
