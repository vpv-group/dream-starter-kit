"use client";

import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@acme/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";

import { useVoters } from "../../hooks/use-feedback";
import { VOTE_PRIORITY_LABELS } from "../../shared/config";

export interface VoterLite {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  priority: string | null;
}

/** Canny's VOTERS list: ~15 rows, then "and N more…" opens the full list. */
export function VotersList({
  postId,
  voters,
  total,
}: {
  postId: string;
  voters: VoterLite[];
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const all = useVoters(open ? postId : "", 500);
  const more = total - voters.length;

  if (total === 0) {
    return <p className="text-muted-foreground text-sm">No votes yet.</p>;
  }
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {voters.map((v) => (
          <VoterRow key={v.user_id} voter={v} />
        ))}
      </ul>
      {more > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground mt-1 text-left text-sm"
        >
          and {more} more…
        </button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Voters ({total})</DialogTitle>
          </DialogHeader>
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {(all.data ?? voters).map((v) => (
              <VoterRow key={v.user_id} voter={v} />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VoterRow({ voter }: { voter: VoterLite }) {
  const name = voter.display_name ?? "Anonymous";
  return (
    <li className="flex items-center gap-2 text-sm">
      <Avatar className="size-6">
        {voter.avatar_url ? (
          <AvatarImage src={voter.avatar_url} alt="" />
        ) : null}
        <AvatarFallback className="text-[10px]">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
      {voter.priority ? (
        <span className="text-muted-foreground ml-auto text-xs">
          {voter.priority in VOTE_PRIORITY_LABELS
            ? VOTE_PRIORITY_LABELS[
                voter.priority as keyof typeof VOTE_PRIORITY_LABELS
              ]
            : voter.priority}
        </span>
      ) : null}
    </li>
  );
}
