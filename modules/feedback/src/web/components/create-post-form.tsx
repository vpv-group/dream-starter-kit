"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCaptcha } from "@acme/app";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Card, CardContent } from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import { Textarea } from "@acme/ui/textarea";

import type { BoardForm, StatusLite } from "../../data";
import {
  isAuthRequired,
  useCreatePost,
  useSimilarPosts,
} from "../../hooks/use-feedback";
import { useAuthPrompt } from "./auth-prompt";
import { StatusBadge } from "./status-badge";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Canny's create form. Labels, placeholders, the submit text and up to
 * three custom fields come from the board (/admin → Feedback → Boards →
 * Create Post Form). "Similar feedback" appears under the title as you type
 * so people vote on an existing post instead of duplicating it.
 * `variant="card"` is the inline desktop card; `"page"` is the phone page
 * with uppercase labels and a full-width submit.
 */
export function CreatePostForm({
  board,
  form,
  categories,
  statuses,
  anonPosts,
  variant = "card",
}: {
  board: { id: string; slug: string; name: string };
  form: BoardForm;
  categories: { id: string; name: string; parent_id: string | null }[];
  statuses: StatusLite[];
  anonPosts: boolean;
  variant?: "card" | "page";
}) {
  const router = useRouter();
  const create = useCreatePost();
  const prompt = useAuthPrompt();
  const { token, reset } = useCaptcha();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(variant === "page");
  const debouncedTitle = useDebounced(title, 300);
  const similar = useSimilarPosts(debouncedTitle, board.id);
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const upper = variant === "page";

  const reset$ = () => {
    setTitle("");
    setDetails("");
    setCategoryId("");
    setCustom({});
    if (variant === "card") setExpanded(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        boardId: board.id,
        title,
        details,
        categoryId: categoryId || null,
        customFields: custom,
        anonAllowed: anonPosts,
        captchaToken: token,
      },
      {
        onSuccess: (post) => {
          reset$();
          if (post.approvalState === "pending") {
            toast.success("Thanks! Your post will appear once it's approved.");
            router.refresh();
          } else {
            router.push(`/feedback/${post.boardSlug}/p/${post.slug}`);
          }
        },
        onError: (err) => {
          if (isAuthRequired(err)) prompt.open("post");
          else toast.error(err.message);
        },
        onSettled: () => reset(),
      },
    );
  };

  const labelClass = cn(
    "text-sm font-medium",
    upper && "text-muted-foreground text-xs tracking-wide uppercase",
  );

  const body = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fb-title" className={labelClass}>
          {form.titleLabel}
        </Label>
        <Input
          id="fb-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder={form.titlePlaceholder}
          maxLength={400}
          required
        />
      </div>

      {similar.data && similar.data.length > 0 ? (
        <div className="bg-muted/40 rounded-md border p-3">
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Similar feedback
          </p>
          <ul className="flex flex-col gap-2">
            {similar.data.map((p) => {
              const st = p.status_id ? statusById.get(p.status_id) : undefined;
              return (
                <li key={p.id}>
                  <Link
                    href={`/feedback/${board.slug}/p/${p.slug}`}
                    className="hover:bg-background block rounded-md p-1.5"
                  >
                    <p className="text-sm font-medium">{p.title}</p>
                    {p.details ? (
                      <p className="text-muted-foreground line-clamp-1 text-xs">
                        {p.details}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                      <span className="tabular-nums">{p.vote_count} votes</span>
                      {st && !st.is_default ? (
                        <>
                          <span aria-hidden>·</span>
                          <StatusBadge status={st} />
                        </>
                      ) : null}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {expanded ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="fb-details" className={labelClass}>
              {form.detailsLabel}
            </Label>
            <Textarea
              id="fb-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={form.detailsPlaceholder}
              maxLength={5000}
              rows={3}
              className="field-sizing-content min-h-16"
            />
          </div>

          {categories.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label className={labelClass}>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.parent_id ? `— ${c.name}` : c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {form.customFields.map((f) => (
            <div key={f.key} className="flex flex-col gap-2">
              <Label htmlFor={`fb-cf-${f.key}`} className={labelClass}>
                {f.label}
                {f.required ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </Label>
              {f.type === "select" ? (
                <Select
                  value={custom[f.key] ?? ""}
                  onValueChange={(v) =>
                    setCustom((c) => ({ ...c, [f.key]: v }))
                  }
                >
                  <SelectTrigger id={`fb-cf-${f.key}`} className="w-full">
                    <SelectValue placeholder={f.placeholder || "Choose…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "textarea" ? (
                <Textarea
                  id={`fb-cf-${f.key}`}
                  value={custom[f.key] ?? ""}
                  placeholder={f.placeholder}
                  required={f.required}
                  onChange={(e) =>
                    setCustom((c) => ({ ...c, [f.key]: e.target.value }))
                  }
                />
              ) : (
                <Input
                  id={`fb-cf-${f.key}`}
                  value={custom[f.key] ?? ""}
                  placeholder={f.placeholder}
                  required={f.required}
                  onChange={(e) =>
                    setCustom((c) => ({ ...c, [f.key]: e.target.value }))
                  }
                />
              )}
            </div>
          ))}

          <div
            className={cn(
              "flex items-center justify-end gap-2",
              upper && "flex-col",
            )}
          >
            {variant === "card" ? (
              <Button type="button" variant="ghost" onClick={reset$}>
                Cancel
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={create.isPending || title.trim().length < 3}
              className={cn(upper && "w-full uppercase")}
            >
              {create.isPending ? "Posting…" : form.submitLabel}
            </Button>
          </div>
        </>
      ) : null}
    </form>
  );

  if (variant === "page") return body;
  return (
    <Card variant="framed">
      <CardContent className="py-4">{body}</CardContent>
    </Card>
  );
}
