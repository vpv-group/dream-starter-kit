"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronUpIcon,
  ClockIcon,
  LightbulbIcon,
  NewspaperIcon,
  RocketIcon,
  UsersIcon,
} from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import type { ChartConfig } from "@acme/ui/chart";
import { cn } from "@acme/ui";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";
import {
  ChartContainer,
  ChartGrid,
  ChartTooltip,
  ChartTooltipContent,
} from "@acme/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import { Skeleton } from "@acme/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@acme/ui/table";

import type { Tone } from "../shared/config";
import type { Insights, InsightsTotal } from "../shared/insights";
import { useBoards, useInsights } from "../hooks/use-feedback";
import { delta, SOURCE_LABELS } from "../shared/insights";
import { TONE_DOT, toneOf } from "../shared/tones";

const PERIODS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" },
];

/** Staff workspace → Insights: what came in, what moved, what shipped. */
export function InsightsTab() {
  const [days, setDays] = useState(30);
  const [board, setBoard] = useState<string | null>(null);
  const boards = useBoards();
  const insights = useInsights(days, board);
  const data = insights.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.days} value={String(p.days)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={board ?? "all"}
          onValueChange={(v) => setBoard(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-44" aria-label="Board">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All boards</SelectItem>
            {(boards.data ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <InsightsBody data={data} days={days} />
      )}
    </div>
  );
}

function InsightsBody({ data, days }: { data: Insights; days: number }) {
  const boards = useBoards();
  const boardSlug = new Map((boards.data ?? []).map((b) => [b.id, b.slug]));
  const compare = days === 365 ? "previous 12 months" : `previous ${days} days`;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="New posts"
          icon={LightbulbIcon}
          total={data.totals.posts}
          compare={compare}
        />
        <StatTile
          label="Votes"
          icon={ChevronUpIcon}
          total={data.totals.votes}
          compare={compare}
        />
        <StatTile
          label="Voters"
          icon={UsersIcon}
          total={data.totals.voters}
          compare={compare}
        />
        <StatTile
          label="Shipped"
          icon={RocketIcon}
          total={data.totals.shipped}
          compare={compare}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SeriesCard data={data} metric="posts" title="New posts" />
        <SeriesCard data={data} metric="votes" title="Votes" />
        <SeriesCard data={data} metric="comments" title="Comments" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card variant="framed" className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Top requests</CardTitle>
            <CardDescription>By votes gained in this period.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.topPosts.length === 0 ? (
              <p className="text-muted-foreground px-6 py-4 text-sm">
                No votes in this period.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Post</TableHead>
                    <TableHead className="text-right">Gained</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topPosts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-0 truncate">
                        <Link
                          href={`/feedback/${boardSlug.get(p.boardId) ?? p.boardSlug}/p/${p.slug}`}
                          className="font-medium hover:underline"
                        >
                          {p.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        +{p.gained.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {p.votes.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card variant="framed">
          <CardHeader>
            <CardTitle>All posts by status</CardTitle>
            <CardDescription>
              Right now, across the period&apos;s boards.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <BarList
              rows={data.byStatus.map((s) => ({
                key: s.id,
                label: s.name,
                count: s.count,
                tone: toneOf(s.tone),
              }))}
              empty="No posts yet."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card variant="framed">
          <CardHeader>
            <CardTitle>Where posts came from</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <BarList
              rows={data.bySource.map((s) => ({
                key: s.source,
                label: SOURCE_LABELS[s.source] ?? s.source,
                count: s.count,
              }))}
              empty="No new posts in this period."
            />
          </CardContent>
        </Card>
        <Card variant="framed">
          <CardHeader>
            <CardTitle>New posts by board</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <BarList
              rows={data.byBoard.map((b) => ({
                key: b.id,
                label: b.name,
                count: b.count,
              }))}
              empty="No new posts in this period."
            />
          </CardContent>
        </Card>
        <Card variant="framed">
          <CardHeader>
            <CardTitle>Responsiveness</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 py-3">
            <Fact
              icon={ClockIcon}
              label="Median time to first status update"
              value={
                data.medianDaysToFirstResponse === null
                  ? "–"
                  : `${data.medianDaysToFirstResponse} days`
              }
            />
            <Fact
              icon={NewspaperIcon}
              label="People who read the changelog"
              value={data.changelogReaders.toLocaleString()}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatTile({
  label,
  icon: Icon,
  total,
  compare,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  total: InsightsTotal;
  compare: string;
}) {
  const change = delta(total);
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
            <Icon className="size-4" aria-hidden />
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-2xl font-semibold tabular-nums lg:text-3xl">
          {total.current.toLocaleString()}
        </span>
        <span className="text-muted-foreground text-sm">
          {change === null ? (
            <>New vs the {compare}</>
          ) : (
            <>
              <span
                className={cn(
                  "font-medium",
                  change > 0 && "text-success",
                  change < 0 && "text-destructive",
                )}
              >
                {change > 0 ? "+" : ""}
                {change}%
              </span>{" "}
              vs the {compare}
            </>
          )}
        </span>
      </CardContent>
    </Card>
  );
}

const formatBucket = (unit: Insights["unit"]) => (value: unknown) => {
  const label = new Date(String(value)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return unit === "week" ? `Week of ${label}` : label;
};

/** One measure per chart (one axis each), in the first series color. */
function SeriesCard({
  data,
  metric,
  title,
}: {
  data: Insights;
  metric: "posts" | "votes" | "comments";
  title: string;
}) {
  const config: ChartConfig = {
    [metric]: { label: title, color: "var(--chart-1)" },
  };
  const total = data.series.reduce((n, b) => n + b[metric], 0);
  const fmt = formatBucket(data.unit);
  return (
    <Card variant="framed">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {total.toLocaleString()} {data.unit === "day" ? "by day" : "by week"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <ChartContainer config={config} className="aspect-auto h-40">
          <BarChart data={data.series} barCategoryGap={2} accessibilityLayer>
            <ChartGrid />
            <XAxis
              dataKey="bucket"
              tickFormatter={fmt}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <ChartTooltip
              cursor={{ fillOpacity: 0.5 }}
              content={<ChartTooltipContent labelFormatter={(l) => fmt(l)} />}
            />
            <Bar
              dataKey={metric}
              fill={`var(--color-${metric})`}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
        <details className="text-muted-foreground mt-2 text-xs">
          <summary className="cursor-pointer">Show as table</summary>
          <table className="mt-2 w-full tabular-nums">
            <tbody>
              {data.series.map((b) => (
                <tr key={b.bucket}>
                  <td>{fmt(b.bucket)}</td>
                  <td className="text-right">{b[metric]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </CardContent>
    </Card>
  );
}

/** Labeled horizontal bars (count shown, so no hover needed). */
function BarList({
  rows,
  empty,
}: {
  rows: { key: string; label: string; count: number; tone?: Tone }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2">
            {r.tone ? (
              <span
                aria-hidden
                className={cn("size-2 rounded-full", TONE_DOT[r.tone])}
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {r.count.toLocaleString()}
            </span>
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                r.tone ? TONE_DOT[r.tone] : "bg-chart-1",
              )}
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="flex flex-col">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
    </div>
  );
}
