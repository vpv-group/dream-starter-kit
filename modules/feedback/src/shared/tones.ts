import type { Tone } from "./config";

/**
 * THE tone map for the module (DESIGN-SYSTEM §5): statuses, tags and
 * changelog types render through the kit's status-tone tokens only
 * (`--info`, `--success`, `--warning`, `--destructive` + `*-subtle`), so
 * themes and dark mode carry through. Web badges use `@acme/ui/badge`'s tone
 * variants via `toneBadgeVariant`; these classes cover text and dots.
 */

/** Uppercase status label color (post page, roadmap headers). */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  info: "text-info",
  warning: "text-warning",
  success: "text-success",
  destructive: "text-destructive",
};

/** Solid fill (dots, chart segments). */
export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  destructive: "bg-destructive",
};

/** Subtle pill (native, where the web Badge component isn't available). */
export const TONE_PILL: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-subtle text-info",
  warning: "bg-warning-subtle text-warning",
  success: "bg-success-subtle text-success",
  destructive: "bg-destructive-subtle text-destructive",
};

export function toneOf(value: string | null | undefined): Tone {
  return value === "info" ||
    value === "warning" ||
    value === "success" ||
    value === "destructive"
    ? value
    : "neutral";
}
