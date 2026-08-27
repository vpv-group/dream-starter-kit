"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@acme/ui";

/**
 * Table-of-contents sidebar for the /legal shell: every published legal
 * document, with the one being read highlighted. Desktop: sticky left rail.
 * Mobile: a horizontally scrollable row above the document.
 */
export function LegalNav({
  docs,
}: {
  docs: { title: string; slug: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Legal documents">
      <p className="text-muted-foreground mb-2 hidden px-3 text-xs font-medium tracking-wide uppercase lg:block">
        Legal
      </p>
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {docs.map((doc) => {
          const href = `/legal/${doc.slug}`;
          const active = pathname === href;
          return (
            <li key={doc.slug} className="shrink-0 lg:shrink">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors lg:whitespace-normal",
                  active
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {doc.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
