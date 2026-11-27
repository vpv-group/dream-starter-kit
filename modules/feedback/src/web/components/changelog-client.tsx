"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BellIcon,
  BellOffIcon,
  HeartIcon,
  LinkIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useSupabase } from "@acme/api";
import { useCaptcha } from "@acme/app";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Checkbox } from "@acme/ui/checkbox";
import { Label } from "@acme/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@acme/ui/popover";
import { RadioGroup, RadioGroupItem } from "@acme/ui/radio-group";

import {
  ensureWriter,
  feedbackApi,
  isAuthRequired,
} from "../../hooks/use-feedback";
import { CHANGELOG_TYPE_META, CHANGELOG_TYPES } from "../../shared/changelog";
import { useAuthPrompt } from "./auth-prompt";

/** "Search Entries…" + Filters (Type radio, Labels checkboxes) — URL state. */
export function ChangelogToolbar({
  labels,
}: {
  labels: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const type = params.get("type") ?? "all";
  const selected = new Set(params.getAll("label"));

  const push = (fn: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    fn(next);
    next.delete("page");
    router.push(`?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get("q") ?? "") === q.trim()) return;
      push((p) => (q.trim() ? p.set("q", q.trim()) : p.delete("q")));
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on q only
  }, [q]);

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="border-input focus-within:ring-ring/50 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border px-2 text-sm focus-within:ring-[3px] sm:max-w-xs">
        <SearchIcon
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Entries…"
          aria-label="Search entries"
          className="placeholder:text-muted-foreground w-full min-w-0 bg-transparent outline-none"
        />
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <SlidersHorizontalIcon />
            Filters
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <h2 className="pb-3 text-sm font-semibold">Filters</h2>
          <p className="text-muted-foreground pb-2 text-xs font-medium uppercase">
            Type
          </p>
          <RadioGroup
            value={type}
            onValueChange={(v) =>
              push((p) => (v === "all" ? p.delete("type") : p.set("type", v)))
            }
          >
            {(["all", ...CHANGELOG_TYPES] as const).map((t) => (
              <div key={t} className="flex items-center gap-2">
                <RadioGroupItem id={`cl-type-${t}`} value={t} />
                <Label htmlFor={`cl-type-${t}`} className="font-normal">
                  {t === "all" ? "All entries" : CHANGELOG_TYPE_META[t].label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {labels.length ? (
            <>
              <p className="text-muted-foreground pt-4 pb-2 text-xs font-medium uppercase">
                Labels
              </p>
              <div className="flex flex-col gap-2">
                {labels.map((l) => (
                  <div key={l.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`cl-label-${l.id}`}
                      checked={selected.has(l.id)}
                      onCheckedChange={(v) =>
                        push((p) => {
                          const all = new Set(p.getAll("label"));
                          if (v === true) all.add(l.id);
                          else all.delete(l.id);
                          p.delete("label");
                          for (const id of all) p.append("label", id);
                        })
                      }
                    />
                    <Label htmlFor={`cl-label-${l.id}`} className="font-normal">
                      {l.name}
                    </Label>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Collapse / expand an entry's body (Canny's minus button). */
export function CollapsibleBody({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-0 right-0 size-8"
        aria-expanded={open}
        aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        onClick={() => setOpen(!open)}
      >
        {open ? <MinusIcon /> : <PlusIcon />}
      </Button>
      <div className={cn(!open && "hidden")}>{children}</div>
    </>
  );
}

/** Footer: like, copy link, share on Facebook / X. */
export function EntryActions({
  entryId,
  url,
  title,
  likes,
  mine,
  showLikes,
  showShare,
  anonAllowed,
}: {
  entryId: string;
  url: string;
  title: string;
  likes: number;
  mine: boolean;
  showLikes: boolean;
  showShare: boolean;
  anonAllowed: boolean;
}) {
  const supabase = useSupabase();
  const prompt = useAuthPrompt();
  const { token, reset } = useCaptcha();
  const [state, setState] = useState({ likes, mine });
  const [pending, setPending] = useState(false);

  const like = async () => {
    const before = state;
    const next = {
      likes: state.likes + (state.mine ? -1 : 1),
      mine: !state.mine,
    };
    setState(next);
    setPending(true);
    try {
      await ensureWriter(supabase, anonAllowed, token);
      await feedbackApi(supabase, "/changelog/react", {
        body: { entryId, liked: next.mine },
      });
    } catch (err) {
      setState(before);
      if (isAuthRequired(err)) prompt.open("vote");
      else toast.error((err as Error).message);
    } finally {
      setPending(false);
      reset();
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      {showLikes ? (
        <Button
          variant="outline"
          size="sm"
          aria-pressed={state.mine}
          disabled={pending}
          onClick={() => void like()}
          className={cn(state.mine && "border-destructive/40 text-destructive")}
        >
          <HeartIcon className={cn(state.mine && "fill-current")} />
          {state.likes} {state.likes === 1 ? "like" : "likes"}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Copy link"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            toast.success("Link copied");
          }}
        >
          <LinkIcon />
        </Button>
        {showShare ? (
          <>
            <Button asChild variant="ghost" size="icon" className="size-8">
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Share on Facebook"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H7v4h2v7h4v-7h3l1-4h-4V9c0-.6.4-1 1-1z" />
                </svg>
              </a>
            </Button>
            <Button asChild variant="ghost" size="icon" className="size-8">
              <a
                href={`https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Share on X"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M18.2 2h3.4l-7.4 8.5L23 22h-6.8l-5.3-7-6.1 7H1.4l7.9-9L1 2h7l4.8 6.4L18.2 2zm-1.2 18h1.9L7.1 4H5.1L17 20z" />
                </svg>
              </a>
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Subscribe to update emails (signed-in members). */
export function SubscribeButton({ subscribed }: { subscribed: boolean }) {
  const supabase = useSupabase();
  const prompt = useAuthPrompt();
  const router = useRouter();
  const [on, setOn] = useState(subscribed);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await feedbackApi(supabase, "/changelog/subscribe", {
            body: { subscribed: !on },
          });
          setOn(!on);
          toast.success(
            on ? "Unsubscribed" : "Subscribed — we'll email you new updates",
          );
          router.refresh();
        } catch (err) {
          if (isAuthRequired(err)) prompt.open("vote");
          else toast.error((err as Error).message);
        }
      }}
    >
      {on ? <BellOffIcon /> : <BellIcon />}
      {on ? "Unsubscribe" : "Subscribe"}
    </Button>
  );
}

/** Marks the changelog read for the What's new dot (signed-in only). */
export function MarkChangelogSeen() {
  const supabase = useSupabase();
  useEffect(() => {
    void feedbackApi(supabase, "/changelog/seen", { body: {} }).catch(
      () => undefined,
    );
  }, [supabase]);
  return null;
}
