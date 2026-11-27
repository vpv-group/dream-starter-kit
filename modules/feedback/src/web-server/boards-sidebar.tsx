import Link from "next/link";

import { cn } from "@acme/ui";

/** Canny's BOARDS sidebar (desktop + tablet). */
export function BoardsSidebar({
  boards,
  activeSlug,
}: {
  boards: { slug: string; name: string; show_on_portal_home: boolean }[];
  activeSlug?: string;
}) {
  const visible = boards.filter(
    (b) => b.show_on_portal_home || b.slug === activeSlug,
  );
  return (
    <nav aria-label="Boards" className="flex flex-col gap-1">
      <h2 className="text-muted-foreground px-3 pb-1 text-xs font-semibold tracking-wide uppercase">
        Boards
      </h2>
      {visible.map((b) => (
        <Link
          key={b.slug}
          href={`/feedback/${b.slug}`}
          aria-current={b.slug === activeSlug ? "page" : undefined}
          className={cn(
            "hover:bg-muted rounded-md px-3 py-1.5 text-sm transition-colors",
            b.slug === activeSlug && "bg-muted font-medium",
          )}
        >
          {b.name}
        </Link>
      ))}
    </nav>
  );
}
