"use client";

import * as React from "react";
import * as Recharts from "recharts";

import { cn } from "./index";

/**
 * Chart primitives over Recharts (docs/DESIGN-SYSTEM.md §4.8).
 *
 * `ChartContainer` takes a typed config — one entry per series key with a
 * label and a color — and exposes each color as `--color-<key>`, so marks
 * use `fill="var(--color-votes)"`. Series take `--chart-1…5` in order;
 * status charts use status tones instead. The container also applies the
 * kit's minimal ink: faint horizontal grid only, `text-xs` muted axis
 * labels and `tabular-nums` ticks. Tooltips use the shared tooltip surface;
 * legends sit below as dot + label.
 */

export type ChartConfig = Record<
  string,
  {
    label: React.ReactNode;
    /** Any CSS color, usually `var(--chart-1)` or a status token. */
    color?: string;
  }
>;

const ChartContext = React.createContext<ChartConfig | null>(null);

export function useChartConfig(): ChartConfig {
  const config = React.useContext(ChartContext);
  if (!config)
    throw new Error("useChartConfig must be used in <ChartContainer>");
  return config;
}

const SAFE_KEY = /^[a-zA-Z0-9_-]+$/;

function ChartContainer({
  config,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  config: ChartConfig;
  children: React.ReactElement;
}) {
  const style: Record<string, string> = {};
  for (const [key, item] of Object.entries(config)) {
    if (item.color && SAFE_KEY.test(key)) style[`--color-${key}`] = item.color;
  }
  return (
    <ChartContext.Provider value={config}>
      <div
        data-slot="chart"
        className={cn(
          "aspect-video w-full text-xs tabular-nums",
          // Minimal ink: recessive grid + axes, no focus outline on the svg.
          "[&_.recharts-cartesian-grid_line]:stroke-border/60",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-axis-line]:stroke-border [&_.recharts-cartesian-axis-tick-line]:hidden",
          "[&_.recharts-reference-line_line]:stroke-border",
          "[&_.recharts-tooltip-cursor]:fill-muted/60 [&_.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none",
          className,
        )}
        style={style}
        {...props}
      >
        <Recharts.ResponsiveContainer>{children}</Recharts.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/** Horizontal-only grid, per §4.8. */
function ChartGrid(props: React.ComponentProps<typeof Recharts.CartesianGrid>) {
  return <Recharts.CartesianGrid vertical={false} {...props} />;
}

const ChartTooltip = Recharts.Tooltip;
const ChartLegend = Recharts.Legend;

interface PayloadItem {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  payload?: Record<string, unknown>;
}

function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  labelFormatter,
  valueFormatter = (v) =>
    typeof v === "number" ? v.toLocaleString() : String(v),
  className,
}: {
  active?: boolean;
  payload?: readonly PayloadItem[];
  label?: React.ReactNode;
  hideLabel?: boolean;
  labelFormatter?: (label: React.ReactNode) => React.ReactNode;
  valueFormatter?: (value: number | string) => React.ReactNode;
  className?: string;
}) {
  const config = useChartConfig();
  if (!active || !payload?.length) return null;
  return (
    <div
      data-slot="chart-tooltip"
      className={cn(
        "bg-popover text-popover-foreground grid min-w-32 gap-1.5 rounded-md border px-2.5 py-1.5 text-xs shadow-md",
        className,
      )}
    >
      {hideLabel ? null : (
        <div className="font-medium">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.name ?? "");
        const entry = config[key];
        const value = Array.isArray(item.value)
          ? item.value.join("–")
          : item.value;
        return (
          <div key={key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: entry?.color ?? item.color }}
            />
            <span className="text-muted-foreground">
              {entry?.label ?? item.name}
            </span>
            <span className="text-foreground ml-auto font-medium tabular-nums">
              {value === undefined ? "–" : valueFormatter(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ChartLegendContent({
  payload,
  className,
}: {
  payload?: readonly { dataKey?: unknown; value?: unknown; color?: string }[];
  className?: string;
}) {
  const config = useChartConfig();
  if (!payload?.length) return null;
  return (
    <div
      data-slot="chart-legend"
      className={cn(
        "flex flex-wrap items-center justify-center gap-4 pt-3",
        className,
      )}
    >
      {payload.map((item) => {
        const key =
          typeof item.dataKey === "string" ? item.dataKey : String(item.value);
        const entry = config[key];
        return (
          <div
            key={key}
            className="text-muted-foreground flex items-center gap-1.5"
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: entry?.color ?? item.color }}
            />
            {entry?.label ?? key}
          </div>
        );
      })}
    </div>
  );
}

export {
  ChartContainer,
  ChartGrid,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
};
