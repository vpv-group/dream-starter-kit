"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArchiveIcon, LockIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Checkbox } from "@acme/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@acme/ui/sheet";
import { Skeleton } from "@acme/ui/skeleton";
import { toneBadgeVariant } from "@acme/ui/status-dot";
import { Switch } from "@acme/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@acme/ui/table";
import { Textarea } from "@acme/ui/textarea";

import type { IdeasPayload, IdeaStage, StaffIdea } from "../hooks/use-feedback";
import type { IdeaVoterStats, ScoreFactor } from "../shared/score";
import {
  useBoards,
  useCreateIdea,
  useIdea,
  useSetIdeaStage,
  useStatuses,
  useUpdateIdea,
} from "../hooks/use-feedback";
import { FIBONACCI, scoreIdea } from "../shared/score";
import { TONE_DOT, toneOf } from "../shared/tones";
import { IdeaChangelogLinks } from "./changelog-admin";
import { IssuePanel } from "./issue-panel";

export function statsById(data: IdeasPayload | undefined) {
  const map = new Map<string, IdeaVoterStats>();
  for (const s of data?.stats ?? []) {
    map.set(s.idea_id, {
      voters: Number(s.voters),
      must: Number(s.must),
      important: Number(s.important),
      nice: Number(s.nice),
      tags: s.tags,
    });
  }
  return map;
}

export function StageBadge({ stage }: { stage: IdeaStage | undefined }) {
  if (!stage) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={toneBadgeVariant(toneOf(stage.tone))}>{stage.name}</Badge>
  );
}

/**
 * Moving an idea to a stage that maps to a portal status moves every
 * linked post too — confirm first, with an update message and Canny's
 * "Notify voters?" (defaulting to the stage's setting).
 */
export function StageChangeDialog({
  idea,
  stage,
  onClose,
  onMoved,
}: {
  idea: StaffIdea | null;
  stage: IdeaStage | null;
  onClose: () => void;
  onMoved?: () => void;
}) {
  const move = useSetIdeaStage();
  const statuses = useStatuses();
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const status = statuses.data?.find((s) => s.id === stage?.portal_status_id);
  const open = Boolean(idea && stage);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={() => setNotify(stage?.notify_voters ?? true)}
      >
        <DialogHeader>
          <DialogTitle>
            Move to <StageBadge stage={stage ?? undefined} />
          </DialogTitle>
          <DialogDescription>
            {idea?.title}
            {status && idea && idea.linked_posts > 0
              ? ` — ${idea.linked_posts} linked ${idea.linked_posts === 1 ? "post moves" : "posts move"} to “${status.name}”.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {status && idea && idea.linked_posts > 0 ? (
          <>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add an update for voters (optional)"
              rows={3}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="idea-notify"
                checked={notify}
                onCheckedChange={(v) => setNotify(v === true)}
              />
              <Label htmlFor="idea-notify" className="text-sm">
                Notify voters ({idea.vote_total} votes)
              </Label>
            </div>
          </>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={move.isPending}
            onClick={() =>
              idea &&
              stage &&
              move.mutate(
                { ideaId: idea.id, stageId: stage.id, message, notify },
                {
                  onSuccess: (r) => {
                    toast.success(
                      r.moved
                        ? `Moved — ${r.moved} post${r.moved === 1 ? "" : "s"} updated${r.notified ? ", voters notified" : ""}`
                        : "Moved",
                    );
                    setMessage("");
                    onClose();
                    onMoved?.();
                  },
                  onError: (e) => {
                    toast.error(e.message);
                    onClose();
                  },
                },
              )
            }
          >
            Move idea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualFactorInput({
  factor,
  value,
  onChange,
}: {
  factor: ScoreFactor;
  value: number | boolean | null | undefined;
  onChange: (v: number | boolean | null) => void;
}) {
  if (factor.scale === "checkbox") {
    return (
      <Checkbox
        aria-label={factor.name}
        checked={Boolean(value)}
        onCheckedChange={(v) => onChange(v === true)}
      />
    );
  }
  if (factor.scale === "fibonacci" || factor.scale === "stars") {
    const options: readonly number[] =
      factor.scale === "stars" ? [1, 2, 3, 4, 5] : FIBONACCI;
    return (
      <Select
        value={typeof value === "number" ? String(value) : ""}
        onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
      >
        <SelectTrigger size="sm" className="w-20" aria-label={factor.name}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={String(o)}>
              {factor.scale === "stars" ? "★".repeat(o) : o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const max =
    factor.scale === "0-10"
      ? 10
      : factor.scale === "0-100" || factor.scale === "percentage"
        ? 100
        : undefined;
  return (
    <Input
      type="number"
      min={0}
      max={max}
      aria-label={factor.name}
      defaultValue={typeof value === "number" ? value : ""}
      onBlur={(e) => {
        const n = e.target.value === "" ? null : Number(e.target.value);
        if (n !== (typeof value === "number" ? value : null)) onChange(n);
      }}
      className="h-8 w-20"
    />
  );
}

/** The staff Ideas table: stage, score factors, votes, score, ETA. */
export function IdeasTab({
  data,
  loading,
  onOpen,
}: {
  data: IdeasPayload | undefined;
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  const update = useUpdateIdea();
  const create = useCreateIdea();
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [pending, setPending] = useState<{
    idea: StaffIdea;
    stage: IdeaStage;
  } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const stats = useMemo(() => statsById(data), [data]);
  const factors = data?.factors ?? [];
  const stageById = new Map((data?.stages ?? []).map((s) => [s.id, s]));

  const rows = (data?.ideas ?? [])
    .filter((i) => stageFilter === "all" || i.stage_id === stageFilter)
    .filter(
      (i) =>
        !q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase()),
    )
    .map((i) => ({
      idea: i,
      score: scoreIdea(factors, i.factor_values, stats.get(i.id)),
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ideas…"
          className="h-8 w-full sm:w-64"
        />
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {(data?.stages ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim().length < 3) return;
            create.mutate(
              { title: newTitle.trim() },
              {
                onSuccess: (r) => {
                  setNewTitle("");
                  onOpen(r.idea.id);
                },
                onError: (err) => toast.error(err.message),
              },
            );
          }}
        >
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New idea title"
            className="h-8 w-48"
            aria-label="New idea title"
          />
          <Button
            size="sm"
            type="submit"
            disabled={create.isPending || newTitle.trim().length < 3}
          >
            <PlusIcon />
            New idea
          </Button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Idea</TableHead>
              <TableHead className="w-40">Stage</TableHead>
              {factors
                .filter((f) => f.source === "manual")
                .map((f) => (
                  <TableHead key={f.key} className="w-24">
                    {f.name}
                  </TableHead>
                ))}
              <TableHead className="w-20 text-right">Votes</TableHead>
              <TableHead className="w-20 text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4 + factors.length}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4 + factors.length}
                  className="text-muted-foreground h-24 text-center"
                >
                  No ideas yet. Create one here, or from a post ("Create idea
                  from this post").
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ idea, score }) => (
                <TableRow key={idea.id}>
                  <TableCell className="max-w-0">
                    <button
                      type="button"
                      onClick={() => onOpen(idea.id)}
                      className="block w-full truncate text-left font-medium hover:underline"
                    >
                      {idea.title}
                    </button>
                    <span className="text-muted-foreground flex items-center gap-1 text-xs">
                      {idea.linked_posts} linked post
                      {idea.linked_posts === 1 ? "" : "s"}
                      {idea.sync_locked ? (
                        <LockIcon className="size-3" aria-label="Sync locked" />
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={idea.stage_id ?? ""}
                      onValueChange={(v) => {
                        const stage = stageById.get(v);
                        if (stage) setPending({ idea, stage });
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-full"
                        aria-label="Stage"
                      >
                        <StageBadge
                          stage={
                            idea.stage_id
                              ? stageById.get(idea.stage_id)
                              : undefined
                          }
                        />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {(data?.stages ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {factors
                    .filter((f) => f.source === "manual")
                    .map((f) => (
                      <TableCell key={f.key}>
                        <ManualFactorInput
                          factor={f}
                          value={idea.factor_values[f.key]}
                          onChange={(v) =>
                            update.mutate(
                              { ideaId: idea.id, factorValues: { [f.key]: v } },
                              { onError: (e) => toast.error(e.message) },
                            )
                          }
                        />
                      </TableCell>
                    ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {idea.vote_total}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {score}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <StageChangeDialog
        idea={pending?.idea ?? null}
        stage={pending?.stage ?? null}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

/**
 * The internal roadmap: ideas kanban by stage (DESIGN-SYSTEM board pattern —
 * fixed-width columns, horizontal scroll). Drag a card to another stage;
 * the move is optimistic and rolls back on error. Keyboard users change the
 * stage from the card's menu (Ideas table / record sheet).
 */
export function RoadmapBoard({
  data,
  onOpen,
}: {
  data: IdeasPayload | undefined;
  onOpen: (id: string) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{
    idea: StaffIdea;
    stage: IdeaStage;
  } | null>(null);
  const move = useSetIdeaStage();
  const stats = useMemo(() => statsById(data), [data]);
  const factors = data?.factors ?? [];

  const stageOf = (i: StaffIdea) => optimistic[i.id] ?? i.stage_id;

  const drop = (stage: IdeaStage) => {
    const idea = data?.ideas.find((i) => i.id === dragging);
    setDragging(null);
    setOver(null);
    if (!idea || stageOf(idea) === stage.id) return;
    // Moving linked posts deserves a confirmation (message + notify voters).
    if (stage.portal_status_id && idea.linked_posts > 0) {
      setPending({ idea, stage });
      return;
    }
    setOptimistic((o) => ({ ...o, [idea.id]: stage.id }));
    move.mutate(
      { ideaId: idea.id, stageId: stage.id, notify: false },
      {
        onSettled: () =>
          setOptimistic((o) => {
            const { [idea.id]: _done, ...rest } = o;
            return rest;
          }),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {(data?.stages ?? []).map((stage) => {
          const ideas = (data?.ideas ?? []).filter(
            (i) => stageOf(i) === stage.id,
          );
          return (
            <section
              key={stage.id}
              aria-label={stage.name}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage.id);
              }}
              onDragLeave={() => setOver((o) => (o === stage.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(stage);
              }}
              className={cn(
                "bg-muted/40 flex w-[340px] shrink-0 flex-col gap-2 rounded-lg border p-2 transition-colors",
                over === stage.id && "border-primary bg-primary/5",
              )}
            >
              <header className="flex items-center gap-2 px-1 py-1 text-sm font-semibold">
                <span
                  aria-hidden
                  className={cn(
                    "size-2 rounded-full",
                    TONE_DOT[toneOf(stage.tone)],
                  )}
                />
                {stage.name}
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {ideas.length}
                </span>
              </header>
              {ideas.map((idea) => (
                <button
                  key={idea.id}
                  type="button"
                  draggable
                  onDragStart={() => setDragging(idea.id)}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => onOpen(idea.id)}
                  className={cn(
                    "bg-background flex flex-col gap-1.5 rounded-md border p-3 text-left text-sm shadow-xs",
                    dragging === idea.id && "opacity-50",
                  )}
                >
                  <span className="font-medium">{idea.title}</span>
                  <span className="text-muted-foreground flex items-center gap-3 text-xs tabular-nums">
                    <span>{idea.vote_total} votes</span>
                    <span>{idea.linked_posts} posts</span>
                    <span className="ml-auto">
                      Score{" "}
                      {scoreIdea(
                        factors,
                        idea.factor_values,
                        stats.get(idea.id),
                      )}
                    </span>
                  </span>
                </button>
              ))}
              {ideas.length === 0 ? (
                <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                  Drop ideas here
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
      <StageChangeDialog
        idea={pending?.idea ?? null}
        stage={pending?.stage ?? null}
        onClose={() => setPending(null)}
      />
    </>
  );
}

/** Idea record sheet: details, ETA, sync lock, linked posts, archive. */
export function IdeaSheet({
  id,
  data,
  onClose,
}: {
  id: string | null;
  data: IdeasPayload | undefined;
  onClose: () => void;
}) {
  const detail = useIdea(id);
  const update = useUpdateIdea();
  const boards = useBoards();
  const statuses = useStatuses();
  const [pendingStage, setPendingStage] = useState<IdeaStage | null>(null);
  const idea = detail.data?.idea;
  const boardSlug = new Map((boards.data ?? []).map((b) => [b.id, b.slug]));
  const statusName = new Map((statuses.data ?? []).map((s) => [s.id, s.name]));
  const stageById = new Map((data?.stages ?? []).map((s) => [s.id, s]));
  const save = (patch: Omit<Parameters<typeof update.mutate>[0], "ideaId">) =>
    idea &&
    update.mutate(
      { ideaId: idea.id, ...patch },
      { onError: (e) => toast.error(e.message) },
    );
  const ideaForDialog = idea
    ? { ...idea, linked_posts: detail.data?.posts.length ?? 0 }
    : null;

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{idea?.title ?? "Idea"}</SheetTitle>
          <SheetDescription>
            {idea
              ? `${idea.vote_total} votes across ${detail.data?.posts.length ?? 0} linked posts`
              : ""}
          </SheetDescription>
        </SheetHeader>
        {!idea ? (
          <Skeleton className="mx-4 h-40" />
        ) : (
          <div key={idea.id} className="flex flex-col gap-5 px-4 pb-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="idea-title">Title</Label>
              <Input
                id="idea-title"
                defaultValue={idea.title}
                onBlur={(e) =>
                  e.target.value !== idea.title &&
                  save({ title: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="idea-desc">Description</Label>
              <Textarea
                id="idea-desc"
                rows={5}
                defaultValue={idea.description}
                onBlur={(e) =>
                  e.target.value !== idea.description &&
                  save({ description: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Stage</Label>
                <Select
                  value={idea.stage_id ?? ""}
                  onValueChange={(v) =>
                    setPendingStage(stageById.get(v) ?? null)
                  }
                >
                  <SelectTrigger size="sm" className="w-full">
                    <StageBadge
                      stage={
                        idea.stage_id ? stageById.get(idea.stage_id) : undefined
                      }
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(data?.stages ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="idea-eta">ETA</Label>
                <Input
                  id="idea-eta"
                  type="month"
                  className="h-8"
                  defaultValue={idea.eta?.slice(0, 7) ?? ""}
                  onBlur={(e) => save({ eta: e.target.value || null })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="idea-eta-public" className="font-normal">
                  Show the ETA publicly
                </Label>
                <Switch
                  id="idea-eta-public"
                  checked={idea.eta_public}
                  onCheckedChange={(v) => save({ etaPublic: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="idea-lock" className="font-normal">
                  Lock stage (integrations never move it)
                </Label>
                <Switch
                  id="idea-lock"
                  checked={idea.sync_locked}
                  onCheckedChange={(v) => save({ syncLocked: v })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Linked posts</h3>
              {(detail.data?.posts ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No posts yet — link them from a post&apos;s sidebar.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {detail.data?.posts.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/feedback/${boardSlug.get(p.board_id) ?? ""}/p/${p.slug}`}
                        className="hover:bg-muted flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
                      >
                        <span className="w-8 text-right font-semibold tabular-nums">
                          {p.vote_count}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {p.title}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {p.status_id ? statusName.get(p.status_id) : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <IssuePanel ideaId={idea.id} links={detail.data?.links ?? []} />
            <IdeaChangelogLinks ideaId={idea.id} />
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                save({ archived: !idea.archived });
                if (!idea.archived) onClose();
              }}
            >
              <ArchiveIcon />
              {idea.archived ? "Restore" : "Archive"}
            </Button>
          </div>
        )}
        <StageChangeDialog
          idea={ideaForDialog}
          stage={pendingStage}
          onClose={() => setPendingStage(null)}
          onMoved={() => void detail.refetch()}
        />
      </SheetContent>
    </Sheet>
  );
}
