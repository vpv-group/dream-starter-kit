import type { Metadata } from "next";
import Link from "next/link";
import { MegaphoneIcon, RssIcon } from "lucide-react";

import { Button } from "@acme/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@acme/ui/empty";
import { Separator } from "@acme/ui/separator";

import { CHANGELOG_TYPES } from "../shared/changelog";
import {
  ChangelogToolbar,
  MarkChangelogSeen,
  SubscribeButton,
} from "../web/components/changelog-client";
import {
  entryExtras,
  isChangelogSubscriber,
  listEntries,
  listLabels,
} from "./changelog-data";
import { ChangelogEntry } from "./changelog-entry";
import { loadPortal } from "./portal-data";
import { PortalShell } from "./portal-shell";

const PAGE = 10;
const RSS_PATH = "/api/mod/feedback/changelog/rss.xml";

export const metadata: Metadata = {
  title: "Changelog",
  alternates: { types: { "application/rss+xml": RSS_PATH } },
};

/**
 * The changelog (Canny / hiverhq.com layout): title + subtitle, RSS and
 * Subscribe; "Search Entries…" + Filters (type, labels); entries with a
 * date gutter, separated, then Load more. Entries are Payload docs.
 */
export async function ChangelogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const many = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];
  const portal = await loadPortal();
  const s = portal.settings;
  const typeParam = one(sp.type);
  const type = CHANGELOG_TYPES.includes(
    typeParam as (typeof CHANGELOG_TYPES)[number],
  )
    ? typeParam
    : null;
  const page = Math.min(Math.max(Number(one(sp.page) ?? 0) || 0, 0), 50);
  const q = one(sp.q)?.slice(0, 200) ?? null;
  const [entries, labels, subscribed] = await Promise.all([
    listEntries(portal, {
      type,
      labels: many(sp.label),
      q,
      limit: (page + 1) * PAGE,
    }),
    listLabels(portal),
    isChangelogSubscriber(portal),
  ]);
  const extras = await entryExtras(portal, entries);
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const more = new URLSearchParams();
  for (const [k, v] of Object.entries(sp))
    for (const x of many(v)) if (k !== "page") more.append(k, x);
  more.set("page", String(page + 1));

  return (
    <PortalShell portal={portal}>
      {/* RSS autodiscovery — React hoists <link> into <head>. */}
      {s.changelogRss !== false ? (
        <link
          rel="alternate"
          type="application/rss+xml"
          title={s.changelogTitle ?? "Changelog"}
          href={RSS_PATH}
        />
      ) : null}
      {portal.viewer && !portal.viewer.anonymous ? <MarkChangelogSeen /> : null}
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {s.changelogTitle ?? "Changelog"}
          </h1>
          {s.changelogSubtitle ? (
            <p className="text-muted-foreground">{s.changelogSubtitle}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {s.changelogRss !== false ? (
              <Button asChild variant="link" size="sm" className="h-auto px-0">
                <a href={RSS_PATH}>
                  <RssIcon />
                  RSS
                </a>
              </Button>
            ) : null}
            {s.changelogSubscriptions !== false ? (
              <SubscribeButton subscribed={subscribed} />
            ) : null}
          </div>
        </header>
        <ChangelogToolbar labels={labels} />
        {entries.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MegaphoneIcon />
              </EmptyMedia>
              <EmptyTitle>
                {q || type ? "No matching entries" : "No updates yet"}
              </EmptyTitle>
              <EmptyDescription>
                {portal.viewer?.staff
                  ? "Write one in /admin → Feedback → Changelog."
                  : "Check back soon."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-8">
            {entries.map((e, i) => (
              <div key={e.id} className="flex flex-col gap-8">
                {i > 0 ? <Separator /> : null}
                <ChangelogEntry
                  entry={e}
                  siteUrl={siteUrl}
                  likes={
                    extras.likes.get(String(e.id)) ?? { likes: 0, mine: false }
                  }
                  requestedBy={extras.requestedBy.get(String(e.id)) ?? 0}
                  showLikes={s.changelogReactions !== false}
                  showShare={s.changelogShare !== false}
                  anonAllowed={s.anonVotes ?? true}
                />
              </div>
            ))}
          </div>
        )}
        {entries.length === (page + 1) * PAGE ? (
          <Button asChild variant="outline" className="self-center">
            <Link href={`?${more.toString()}`} scroll={false}>
              Load more
            </Link>
          </Button>
        ) : null}
      </div>
    </PortalShell>
  );
}
