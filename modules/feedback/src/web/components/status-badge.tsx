import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";
import { toneBadgeVariant } from "@acme/ui/status-dot";

import { TONE_DOT, TONE_TEXT, toneOf } from "../../shared/tones";

interface StatusLike {
  name: string;
  tone: string;
}

/** Status pill from the module's tone map (DESIGN-SYSTEM §5). */
export function StatusBadge({
  status,
  className,
}: {
  status: StatusLike;
  className?: string;
}) {
  return (
    <Badge
      variant={toneBadgeVariant(toneOf(status.tone))}
      className={className}
    >
      {status.name}
    </Badge>
  );
}

/** Canny's uppercase colored status label under a post title. */
export function StatusLabel({
  status,
  className,
}: {
  status: StatusLike;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-xs font-semibold tracking-wide uppercase",
        TONE_TEXT[toneOf(status.tone)],
        className,
      )}
    >
      {status.name}
    </span>
  );
}

export function StatusDotLabel({ status }: { status: StatusLike }) {
  return (
    <span className="flex items-center gap-2 text-sm font-semibold">
      <span
        aria-hidden
        className={cn("size-2 rounded-full", TONE_DOT[toneOf(status.tone)])}
      />
      {status.name}
    </span>
  );
}
