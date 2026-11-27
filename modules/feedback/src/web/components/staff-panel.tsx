"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  LinkIcon,
  MergeIcon,
  MoreHorizontalIcon,
  PinIcon,
  PlusIcon,
  Trash2Icon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@acme/ui/alert-dialog";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Checkbox } from "@acme/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@acme/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@acme/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import { toneBadgeVariant } from "@acme/ui/status-dot";
import { Switch } from "@acme/ui/switch";
import { Textarea } from "@acme/ui/textarea";

import type { VotePriority } from "../../shared/config";
import {
  useCreateIdea,
  useLinkPost,
  useMergePost,
  useSetStatus,
  useSimilarPosts,
  useStaffIdeas,
  useStaffPeople,
  useUpdatePost,
  useVoteOnBehalf,
} from "../../hooks/use-feedback";
import { VOTE_PRIORITIES, VOTE_PRIORITY_LABELS } from "../../shared/config";
import { toneOf } from "../../shared/tones";

interface StatusOption {
  id: string;
  name: string;
  tone: string;
  notify_by_default?: boolean;
}

export interface StaffPostState {
  id: string;
  title: string;
  boardId: string;
  boardSlug: string;
  statusId: string | null;
  categoryId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  eta: string | null;
  etaPublic: boolean;
  pinned: boolean;
  approvalState: string;
  tagIds: string[];
  voteCount: number;
  ideaId: string | null;
  ideaTitle: string | null;
}

/**
 * Staff controls in the post sidebar (Canny's admin view, inline on the
 * portal): status (opens the change dialog with message + "Notify N
 * voters"), owner, category, tags, ETA.
 */
export function StaffSidebar({
  post,
  statuses,
  categories,
  tags,
}: {
  post: StaffPostState;
  statuses: (StatusOption & { notify_by_default?: boolean })[];
  categories: { id: string; name: string }[];
  tags: { id: string; name: string; tone: string }[];
}) {
  const router = useRouter();
  const update = useUpdatePost();
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onSuccess: () => router.refresh(),
      onError: (e) => toast.error(e.message),
    });

  return (
    <div className="flex flex-col gap-4 text-sm">
      <Row label="Idea">
        <IdeaPicker post={post} />
      </Row>
      <Row label="Status">
        {post.ideaId ? (
          <p className="text-muted-foreground text-xs">
            {statuses.find((st) => st.id === post.statusId)?.name ?? "—"} ·
            follows its idea — change the idea&apos;s stage in{" "}
            <a href={`/a/feedback?idea=${post.ideaId}`} className="underline">
              Feedback admin
            </a>
            .
          </p>
        ) : null}
        <Select
          value={post.statusId ?? ""}
          onValueChange={(v) => setPendingStatus(v)}
          disabled={Boolean(post.ideaId)}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="No status" />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Owner">
        <PersonPicker
          staffOnly
          value={post.ownerId}
          valueLabel={post.ownerName}
          placeholder="Unassigned"
          onChange={(id) => save({ postId: post.id, ownerId: id })}
        />
      </Row>
      {categories.length ? (
        <Row label="Category">
          <Select
            value={post.categoryId ?? "none"}
            onValueChange={(v) =>
              save({ postId: post.id, categoryId: v === "none" ? null : v })
            }
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Uncategorized</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      ) : null}
      {tags.length ? (
        <Row label="Tags">
          <TagPicker
            tags={tags}
            value={post.tagIds}
            onChange={(ids) => save({ postId: post.id, tagIds: ids })}
          />
        </Row>
      ) : null}
      <Row label="ETA">
        <div className="flex items-center gap-2">
          <Input
            type="month"
            aria-label="Estimated month"
            defaultValue={post.eta?.slice(0, 7) ?? ""}
            onBlur={(e) => {
              const v = e.target.value || null;
              if (v !== (post.eta?.slice(0, 7) ?? null))
                save({ postId: post.id, eta: v });
            }}
            className="h-8"
          />
          <div className="flex items-center gap-1.5">
            <Switch
              id="eta-public"
              checked={post.etaPublic}
              onCheckedChange={(v) => save({ postId: post.id, etaPublic: v })}
            />
            <Label htmlFor="eta-public" className="text-xs">
              Public
            </Label>
          </div>
        </div>
      </Row>
      <StatusChangeDialog
        post={post}
        statusId={pendingStatus}
        statuses={statuses}
        onClose={() => setPendingStatus(null)}
      />
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Canny's status change: optional update message + "Notify N voters". */
function StatusChangeDialog({
  post,
  statusId,
  statuses,
  onClose,
}: {
  post: StaffPostState;
  statusId: string | null;
  statuses: StatusOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const setStatus = useSetStatus();
  const target = statuses.find((s) => s.id === statusId);
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);

  return (
    <Dialog
      open={Boolean(statusId)}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={() => setNotify(target?.notify_by_default ?? true)}
      >
        <DialogHeader>
          <DialogTitle>
            Change status to{" "}
            {target ? (
              <Badge variant={toneBadgeVariant(toneOf(target.tone))}>
                {target.name}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>{post.title}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add an update for your voters (optional)"
          rows={4}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="notify-voters"
            checked={notify}
            onCheckedChange={(v) => setNotify(v === true)}
          />
          <Label htmlFor="notify-voters" className="text-sm">
            Notify {post.voteCount} {post.voteCount === 1 ? "voter" : "voters"}{" "}
            and followers
          </Label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={setStatus.isPending || !statusId}
            onClick={() =>
              statusId &&
              setStatus.mutate(
                { postId: post.id, statusId, message, notify },
                {
                  onSuccess: () => {
                    toast.success("Status updated");
                    setMessage("");
                    onClose();
                    router.refresh();
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            Update status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Link the post to an idea (Canny's "Ideas"), or create one from it. */
function IdeaPicker({ post }: { post: StaffPostState }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ideas = useStaffIdeas();
  const link = useLinkPost();
  const create = useCreateIdea();
  const done = (msg: string) => () => {
    toast.success(msg);
    setOpen(false);
    router.refresh();
  };
  const fail = (e: Error) => toast.error(e.message);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start font-normal"
        >
          {post.ideaTitle ?? (
            <span className="text-muted-foreground">Not linked</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search ideas…" />
          <CommandList>
            <CommandEmpty>No ideas.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() =>
                  create.mutate(
                    { title: post.title, fromPostId: post.id },
                    {
                      onSuccess: done("Idea created and linked"),
                      onError: fail,
                    },
                  )
                }
              >
                <PlusIcon />
                Create idea from this post
              </CommandItem>
              {post.ideaId ? (
                <CommandItem
                  onSelect={() =>
                    link.mutate(
                      { postId: post.id, ideaId: null },
                      { onSuccess: done("Unlinked"), onError: fail },
                    )
                  }
                >
                  <XIcon />
                  Unlink
                </CommandItem>
              ) : null}
            </CommandGroup>
            <CommandGroup heading="Ideas">
              {(ideas.data?.ideas ?? []).map((idea) => (
                <CommandItem
                  key={idea.id}
                  value={idea.title}
                  onSelect={() =>
                    link.mutate(
                      { postId: post.id, ideaId: idea.id },
                      { onSuccess: done("Linked to idea"), onError: fail },
                    )
                  }
                >
                  <span className="truncate">{idea.title}</span>
                  {idea.id === post.ideaId ? (
                    <CheckIcon className="ml-auto" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PersonPicker({
  value,
  valueLabel,
  placeholder,
  staffOnly,
  onChange,
}: {
  value: string | null;
  valueLabel: string | null;
  placeholder: string;
  staffOnly?: boolean;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const people = useStaffPeople(q, staffOnly);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start font-normal"
        >
          {value ? (
            (valueLabel ?? "Someone")
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Search people…"
          />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {value ? (
                <CommandItem
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <XIcon />
                  Unassign
                </CommandItem>
              ) : null}
              {(people.data ?? []).map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  {p.display_name ?? "Unnamed"}
                  {p.id === value ? <CheckIcon className="ml-auto" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TagPicker({
  tags,
  value,
  onChange,
}: {
  tags: { id: string; name: string; tone: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-auto min-h-8 w-full flex-wrap justify-start gap-1 py-1 font-normal"
        >
          {value.length ? (
            tags
              .filter((t) => selected.has(t.id))
              .map((t) => (
                <Badge key={t.id} variant={toneBadgeVariant(toneOf(t.tone))}>
                  {t.name}
                </Badge>
              ))
          ) : (
            <span className="text-muted-foreground">Add tags</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tags…" />
          <CommandList>
            <CommandEmpty>No tags.</CommandEmpty>
            <CommandGroup>
              {tags.map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.name}
                  onSelect={() => {
                    const next = new Set(selected);
                    if (next.has(t.id)) next.delete(t.id);
                    else next.add(t.id);
                    onChange([...next]);
                  }}
                >
                  {t.name}
                  {selected.has(t.id) ? (
                    <CheckIcon className="ml-auto" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The staff ⋯ menu on a post: Pin, Approve/Reject, Merge into…, Add voter,
 * Copy link, Delete.
 */
export function StaffPostMenu({ post }: { post: StaffPostState }) {
  const router = useRouter();
  const update = useUpdatePost();
  const [dialog, setDialog] = useState<"merge" | "voter" | "delete" | null>(
    null,
  );

  const save = (patch: Parameters<typeof update.mutate>[0], done?: string) =>
    update.mutate(patch, {
      onSuccess: () => {
        if (done) toast.success(done);
        router.refresh();
      },
      onError: (e) => toast.error(e.message),
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Post actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onSelect={() => save({ postId: post.id, pinned: !post.pinned })}
          >
            <PinIcon />
            {post.pinned ? "Unpin" : "Pin to top"}
          </DropdownMenuItem>
          {post.approvalState !== "approved" ? (
            <DropdownMenuItem
              onSelect={() =>
                save({ postId: post.id, approvalState: "approved" }, "Approved")
              }
            >
              <CheckIcon />
              Approve
            </DropdownMenuItem>
          ) : null}
          {post.approvalState === "pending" ? (
            <DropdownMenuItem
              onSelect={() =>
                save({ postId: post.id, approvalState: "rejected" }, "Rejected")
              }
            >
              <XIcon />
              Reject
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setDialog("merge")}>
            <MergeIcon />
            Merge into…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("voter")}>
            <UserPlusIcon />
            Add voter
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard.writeText(window.location.href);
              toast.success("Link copied");
            }}
          >
            <LinkIcon />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDialog("delete")}
          >
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MergeDialog
        post={post}
        open={dialog === "merge"}
        onClose={() => setDialog(null)}
      />
      <AddVoterDialog
        post={post}
        open={dialog === "voter"}
        onClose={() => setDialog(null)}
      />
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the board and roadmap. Votes and comments are
              kept, so staff can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                update.mutate(
                  { postId: post.id, deleted: true },
                  {
                    onSuccess: () => {
                      toast.success("Post deleted");
                      router.push(`/feedback/${post.boardSlug}`);
                    },
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MergeDialog({
  post,
  open,
  onClose,
}: {
  post: StaffPostState;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const merge = useMergePost();
  const [q, setQ] = useState(post.title);
  const similar = useSimilarPosts(open ? q : "", undefined);
  const options = (similar.data ?? []).filter((p) => p.id !== post.id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 sm:max-w-lg">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Merge into another post</DialogTitle>
          <DialogDescription>
            This post's voters move to the one you pick; it then redirects
            there. Nobody is notified, and you can unmerge from the activity
            log.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Search posts…"
          />
          <CommandList>
            <CommandEmpty>
              {q.trim().length < 3 ? "Type to search." : "No posts found."}
            </CommandEmpty>
            <CommandGroup>
              {options.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() =>
                    merge.mutate(
                      { sourceId: post.id, targetId: p.id },
                      {
                        onSuccess: () => {
                          toast.success("Merged");
                          onClose();
                          router.refresh();
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  <span className="truncate">{p.title}</span>
                  <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                    {p.vote_count} votes
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function AddVoterDialog({
  post,
  open,
  onClose,
}: {
  post: StaffPostState;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const vote = useVoteOnBehalf();
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<VotePriority | "none">("none");
  const people = useStaffPeople(open ? q : "");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Add a voter</DialogTitle>
          <DialogDescription>
            Vote on someone's behalf — e.g. a customer who asked on a call.
          </DialogDescription>
        </DialogHeader>
        <div className="px-4">
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as VotePriority | "none")}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No priority</SelectItem>
              {VOTE_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {VOTE_PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Search people…"
          />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {(people.data ?? []).map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() =>
                    vote.mutate(
                      {
                        postId: post.id,
                        userId: p.id,
                        priority: priority === "none" ? null : priority,
                      },
                      {
                        onSuccess: () => {
                          toast.success(`Added ${p.display_name ?? "voter"}`);
                          onClose();
                          router.refresh();
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  {p.display_name ?? "Unnamed"}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
