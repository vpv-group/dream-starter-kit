import { cn } from "@acme/ui";

/**
 * Segmented step progress (enabled steps only) + the "Step 02 / 04" eyebrow.
 * Finished segments use `primary`; the current one uses `foreground`.
 */
export function StepProgress({
  total,
  current,
  showBar = true,
}: {
  total: number;
  /** 0-based index of the current step. */
  current: number;
  showBar?: boolean;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex flex-col gap-4">
      {showBar && total > 1 ? (
        <div
          className="flex gap-1"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={current + 1}
          aria-label={`Step ${current + 1} of ${total}`}
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                i < current
                  ? "bg-primary"
                  : i === current
                    ? "bg-foreground"
                    : "bg-primary/20",
              )}
            />
          ))}
        </div>
      ) : null}
      <StepEyebrow index={pad(current + 1)} total={pad(total)} />
    </div>
  );
}

export function StepEyebrow({
  index,
  total,
}: {
  index: string;
  total: string;
}) {
  return (
    <p className="text-primary font-mono text-xs font-medium tracking-widest uppercase">
      Step {index} <span className="text-muted-foreground px-1">/</span> {total}
    </p>
  );
}
