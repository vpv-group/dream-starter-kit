"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUpIcon } from "lucide-react";
import { toast } from "sonner";

import { useCaptcha } from "@acme/app";
import { cn } from "@acme/ui";

import { isAuthRequired, useVote } from "../../hooks/use-feedback";
import { useAuthPrompt } from "./auth-prompt";

/**
 * Canny's vote box (36×44): chevron-up over the count, filled when you've
 * voted. Optimistic; anonymous visitors vote through an anonymous session
 * (Turnstile) when the board allows it, else the sign-up prompt opens.
 */
export function VoteButton({
  postId,
  votes,
  voted,
  anonAllowed,
  showCount = true,
  disabled,
  className,
}: {
  postId: string;
  votes: number;
  voted: boolean;
  anonAllowed: boolean;
  showCount?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const vote = useVote();
  const { token, reset } = useCaptcha();
  const prompt = useAuthPrompt();
  const [state, setState] = useState({ voted, votes });
  // Re-sync when the server sends fresh props (router.refresh), during render
  // rather than in an effect (react.dev → "adjusting state when a prop changes").
  const [synced, setSynced] = useState({ voted, votes });
  if (synced.voted !== voted || synced.votes !== votes) {
    setSynced({ voted, votes });
    setState({ voted, votes });
  }

  const toggle = () => {
    const next = !state.voted;
    const before = state;
    setState({
      voted: next,
      votes: Math.max(0, state.votes + (next ? 1 : -1)),
    });
    vote.mutate(
      { postId, voted: next, anonAllowed, captchaToken: token },
      {
        onSuccess: (r) => {
          setState({ voted: r.voted, votes: r.votes });
          router.refresh();
        },
        onError: (err) => {
          setState(before);
          if (isAuthRequired(err)) prompt.open("vote");
          else toast.error(err.message);
        },
        onSettled: () => reset(),
      },
    );
  };

  return (
    <button
      type="button"
      aria-pressed={state.voted}
      aria-label={state.voted ? "Remove your vote" : "Vote for this"}
      disabled={Boolean(disabled) || vote.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      className={cn(
        "flex h-11 w-9 shrink-0 flex-col items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] disabled:opacity-60",
        state.voted
          ? "border-primary bg-primary/10 text-primary"
          : "bg-background text-foreground hover:border-foreground/30",
        className,
      )}
    >
      <ChevronUpIcon className="size-4" aria-hidden />
      {showCount ? <span>{state.votes}</span> : null}
    </button>
  );
}
