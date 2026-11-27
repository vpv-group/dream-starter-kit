import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { entryExtras, getEntry } from "./changelog-data";
import { ChangelogEntry } from "./changelog-entry";
import { loadPortal } from "./portal-data";
import { PortalShell } from "./portal-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const portal = await loadPortal();
  const entry = await getEntry(portal, slug);
  return {
    title: entry ? `${entry.title} · Changelog` : "Changelog",
    description: entry?.excerpt ?? undefined,
    alternates: {
      types: { "application/rss+xml": "/api/mod/feedback/changelog/rss.xml" },
    },
  };
}

/** One changelog entry with "← Back to changelog". */
export async function ChangelogEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const portal = await loadPortal();
  const entry = await getEntry(portal, slug);
  if (!entry) notFound();
  const extras = await entryExtras(portal, [entry]);
  const s = portal.settings;
  return (
    <PortalShell portal={portal}>
      {s.changelogRss !== false ? (
        <link
          rel="alternate"
          type="application/rss+xml"
          title={s.changelogTitle ?? "Changelog"}
          href="/api/mod/feedback/changelog/rss.xml"
        />
      ) : null}
      <div className="flex flex-col gap-6">
        <Link
          href="/changelog"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-sm"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          Back to changelog
        </Link>
        <ChangelogEntry
          entry={entry}
          standalone
          siteUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
          likes={
            extras.likes.get(String(entry.id)) ?? { likes: 0, mine: false }
          }
          requestedBy={extras.requestedBy.get(String(entry.id)) ?? 0}
          showLikes={s.changelogReactions !== false}
          showShare={s.changelogShare !== false}
          anonAllowed={s.anonVotes ?? true}
        />
      </div>
    </PortalShell>
  );
}
