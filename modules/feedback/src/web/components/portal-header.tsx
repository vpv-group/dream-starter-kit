"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  LightbulbIcon,
  MapIcon,
  MegaphoneIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";

export interface PortalTab {
  tab: "roadmap" | "feedback" | "changelog";
  label: string;
  href: string;
}

export interface PortalBoardLink {
  slug: string;
  name: string;
  post_count: number;
}

const ICONS = {
  roadmap: MapIcon,
  feedback: LightbulbIcon,
  changelog: MegaphoneIcon,
} as const;

/**
 * The portal's tab row (Canny: Roadmap · Feedback · Changelog with icons,
 * active one underlined) + global search. Below `md` the Feedback tab gives
 * way to a board switcher and a Create button, as Canny does on phones.
 * The site's own header (logo, sign in) sits above it.
 */
export function PortalHeader({
  tabs,
  boards,
  activeBoardSlug,
  canCreate,
}: {
  tabs: PortalTab[];
  boards: PortalBoardLink[];
  activeBoardSlug?: string;
  canCreate?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const activeBoard = boards.find((b) => b.slug === activeBoardSlug);
  const onFeedback = pathname.startsWith("/feedback");

  return (
    <div className="bg-background border-b">
      <div className="mx-auto flex h-11 max-w-[60rem] items-stretch gap-1 px-4 md:px-8 lg:px-0">
        <nav
          aria-label="Portal"
          className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto md:gap-1"
        >
          {tabs.map((t) => {
            const Icon = ICONS[t.tab];
            const active =
              pathname === t.href || pathname.startsWith(`${t.href}/`);
            // Phones: the Feedback tab becomes the board switcher on feedback pages.
            if (t.tab === "feedback" && onFeedback && activeBoard) {
              return (
                <div key={t.tab} className="flex items-stretch">
                  <PortalTabLink
                    href={t.href}
                    active={active}
                    icon={<Icon />}
                    label={t.label}
                    className="hidden md:flex"
                  />
                  <BoardSwitcher boards={boards} active={activeBoard} />
                </div>
              );
            }
            return (
              <PortalTabLink
                key={t.tab}
                href={t.href}
                active={active}
                icon={<Icon />}
                label={t.label}
                compact={onFeedback && Boolean(activeBoard) && !active}
              />
            );
          })}
        </nav>
        <form
          role="search"
          className="flex items-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) {
              router.push(
                `/feedback/search?search=${encodeURIComponent(query.trim())}`,
              );
            }
          }}
        >
          <label
            className={cn(
              "text-muted-foreground hover:text-foreground flex h-8 cursor-text items-center gap-1.5 rounded-md px-2 text-sm transition-[width]",
              searchOpen ? "bg-muted w-36 md:w-56" : "w-auto",
            )}
          >
            <SearchIcon className="size-4 shrink-0" aria-hidden />
            <span className={cn(searchOpen && "sr-only", "hidden sm:inline")}>
              Search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => !query && setSearchOpen(false)}
              aria-label="Search feedback"
              className={cn(
                "text-foreground bg-transparent outline-none",
                searchOpen ? "w-full" : "w-0 sm:w-0",
              )}
            />
          </label>
        </form>
        {canCreate && activeBoard ? (
          <div className="flex items-center pl-1 md:hidden">
            <Button asChild size="icon" className="size-8">
              <Link
                href={`/feedback/${activeBoard.slug}/create`}
                aria-label="Create a post"
              >
                <PlusIcon />
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PortalTabLink({
  href,
  active,
  icon,
  label,
  className,
  compact,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  className?: string;
  /** Phones next to the board switcher: icon only (label stays for AT). */
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? label : undefined}
      className={cn(
        "text-muted-foreground hover:text-foreground relative flex items-center gap-1.5 px-2 text-sm font-medium transition-colors md:px-3 [&_svg]:size-4",
        "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full",
        active && "text-foreground after:bg-primary",
        className,
      )}
    >
      {icon}
      <span className={cn(compact && "max-md:sr-only")}>{label}</span>
    </Link>
  );
}

function BoardSwitcher({
  boards,
  active,
}: {
  boards: PortalBoardLink[];
  active: PortalBoardLink;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="text-foreground after:bg-primary relative flex items-center gap-1.5 px-2 text-sm font-medium after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full md:hidden"
        >
          <span className="max-w-28 truncate">{active.name}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {active.post_count}
          </span>
          <ChevronDownIcon className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {boards.map((b) => (
          <DropdownMenuItem key={b.slug} asChild>
            <Link
              href={`/feedback/${b.slug}`}
              className="flex justify-between gap-2"
            >
              <span className="truncate">{b.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {b.post_count}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
