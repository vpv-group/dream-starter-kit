import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";

import { formOf, listCategories } from "../data";
import { CreatePostForm } from "../web/components/create-post-form";
import { anonFor, loadPortal } from "./portal-data";
import { PortalShell } from "./portal-shell";
import { createServerSupabase } from "./supabase";

export const metadata = { title: "New post · Feedback" };

/** Phones: the full-page create form (Canny's /<board>/create). */
export async function FeedbackCreatePage({
  params,
}: {
  params: Promise<{ board: string }>;
}) {
  const { board: slug } = await params;
  const portal = await loadPortal();
  const board = portal.boards.find((b) => b.slug === slug);
  if (!board) notFound();
  if (!board.allow_new_posts && !portal.viewer?.staff) notFound();
  const categories = await listCategories(
    await createServerSupabase(),
    board.id,
  );
  return (
    <PortalShell portal={portal} activeBoardSlug={board.slug}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link
          href={`/feedback/${board.slug}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          {board.name}
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Create a post</h1>
        <CreatePostForm
          variant="page"
          board={{ id: board.id, slug: board.slug, name: board.name }}
          form={formOf(board)}
          categories={categories}
          statuses={portal.statuses}
          anonPosts={anonFor(portal, board).posts}
        />
      </div>
    </PortalShell>
  );
}
