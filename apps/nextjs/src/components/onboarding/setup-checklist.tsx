import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";

import { cn } from "@acme/ui";

import { Badge } from "~/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "~/components/ui/item";

export type ChecklistStatus = "done" | "current" | "skipped" | "upcoming";

export interface ChecklistItem {
  key: string;
  number: number;
  title: string;
  description?: string;
  status: ChecklistStatus;
  /** Makes the row a link (the /a checklist). */
  href?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Numbered setup rows with fixed status words (Done / Needs you), shared by
 * the Updates step preview and the getting-started checklist on /a.
 */
export function SetupChecklistItems({ items }: { items: ChecklistItem[] }) {
  return (
    <ItemGroup>
      {items.map((item, i) => {
        const inner = (
          <>
            <ItemMedia>
              <span
                className={cn(
                  "flex h-6 min-w-8 items-center justify-center rounded-md px-1.5 font-mono text-xs font-medium",
                  item.status === "done" &&
                    "bg-primary text-primary-foreground",
                  item.status === "current" && "bg-foreground text-background",
                  (item.status === "skipped" || item.status === "upcoming") &&
                    "bg-primary/15 text-foreground",
                )}
              >
                {pad(item.number)}
              </span>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{item.title}</ItemTitle>
              {item.description ? (
                <ItemDescription>{item.description}</ItemDescription>
              ) : item.status === "skipped" ? (
                <ItemDescription>
                  Skipped. It stays on your checklist.
                </ItemDescription>
              ) : null}
            </ItemContent>
            <ItemActions>
              {item.status === "done" ? (
                <Badge variant="secondary" className="text-primary gap-1">
                  <Check className="size-3" aria-hidden />
                  Done
                </Badge>
              ) : item.status === "current" ? (
                <Badge variant="secondary">Needs you</Badge>
              ) : null}
              {item.href ? (
                <ChevronRight
                  className="text-muted-foreground size-4"
                  aria-hidden
                />
              ) : null}
            </ItemActions>
          </>
        );
        return (
          <div key={item.key}>
            {i > 0 ? <ItemSeparator /> : null}
            {item.href ? (
              <Item asChild size="sm" className="px-0">
                <Link href={item.href}>{inner}</Link>
              </Item>
            ) : (
              <Item size="sm" className="px-0">
                {inner}
              </Item>
            )}
          </div>
        );
      })}
    </ItemGroup>
  );
}
