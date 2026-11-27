import * as React from "react";

import { cn } from "@acme/ui";

/**
 * A circular progress indicator, like the App Store's download ring.
 * `value` 0–1 fills the ring; `null` spins an open arc (waiting to start).
 */
function ProgressRing({
  value,
  size = 28,
  stroke = 3,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  value: number | null;
  size?: number;
  stroke?: number;
  /** Shown in the middle (e.g. a stop square). */
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = value === null ? 0.25 : Math.min(1, Math.max(0, value));
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(clamped * 100)}
      data-slot="progress-ring"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn("-rotate-90", value === null && "animate-spin")}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      {children ? (
        <span className="absolute inset-0 flex items-center justify-center">
          {children}
        </span>
      ) : null}
    </span>
  );
}

export { ProgressRing };
