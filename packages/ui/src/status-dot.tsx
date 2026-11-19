import type * as React from "react";

import { cn } from "./index";

/**
 * Status tones (docs/DESIGN-SYSTEM.md §5). Every enumerated value maps to
 * exactly one tone, used as a dot, a badge variant and a chart colour.
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "destructive";

export const TONES: readonly Tone[] = [
  "neutral",
  "info",
  "success",
  "warning",
  "destructive",
];

const DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

/** The Badge variant for a tone. */
export const toneBadgeVariant = (
  tone: Tone,
): "neutral" | "info" | "success" | "warning" | "danger" =>
  tone === "destructive" ? "danger" : tone;

/** Tailwind class for a tone's solid fill (dots, chart segments). */
export const toneFillClass = (tone: Tone): string => DOT[tone];

export function StatusDot({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      data-slot="status-dot"
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        DOT[tone],
        className,
      )}
      {...props}
    />
  );
}
