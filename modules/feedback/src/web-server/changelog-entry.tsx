import Link from "next/link";
import { RichText } from "@payloadcms/richtext-lexical/react";

import { Badge } from "@acme/ui/badge";
import { toneBadgeVariant } from "@acme/ui/status-dot";

import type { EntryView } from "./changelog-data";
import { CHANGELOG_TYPE_META } from "../shared/changelog";
import { toneOf } from "../shared/tones";
import {
  CollapsibleBody,
  EntryActions,
} from "../web/components/changelog-client";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

/**
 * One changelog entry (Canny layout): a date gutter beside the entry from
 * `md` (date above on phones); type + label badges, title link, collapse
 * button, rich text, hero image, "Requested by N", then like / copy link /
 * share.
 */
export function ChangelogEntry({
  entry,
  siteUrl,
  likes,
  requestedBy,
  showLikes,
  showShare,
  anonAllowed,
  standalone,
}: {
  entry: EntryView;
  siteUrl: string;
  likes: { likes: number; mine: boolean };
  requestedBy: number;
  showLikes: boolean;
  showShare: boolean;
  anonAllowed: boolean;
  standalone?: boolean;
}) {
  const meta = CHANGELOG_TYPE_META[entry.type];
  const url = `${siteUrl.replace(/\/$/, "")}/changelog/${entry.slug}`;
  const body = (
    <div className="flex flex-col gap-4">
      {entry.hero ? (
        <img
          src={entry.hero.url}
          alt={entry.hero.alt}
          className="w-full rounded-lg border"
        />
      ) : null}
      {entry.body ? (
        <div className="prose prose-neutral dark:prose-invert max-w-none text-sm [&_img]:max-h-[25rem] [&_img]:rounded-md">
          <RichText
            data={entry.body as Parameters<typeof RichText>[0]["data"]}
          />
        </div>
      ) : entry.excerpt ? (
        <p className="text-sm">{entry.excerpt}</p>
      ) : null}
      {requestedBy > 0 ? (
        <p className="text-muted-foreground text-xs">
          Requested by{" "}
          <span className="font-semibold tabular-nums">{requestedBy}</span>{" "}
          {requestedBy === 1 ? "person" : "people"}
        </p>
      ) : null}
      <EntryActions
        entryId={String(entry.id)}
        url={url}
        title={entry.title}
        likes={likes.likes}
        mine={likes.mine}
        showLikes={showLikes}
        showShare={showShare && entry.audience === "everyone"}
        anonAllowed={anonAllowed}
      />
    </div>
  );

  return (
    <article className="grid gap-3 md:grid-cols-[11rem_1fr] md:gap-8">
      <time
        dateTime={entry.publishedAt}
        className="text-muted-foreground pt-0.5 text-sm"
      >
        {dateFmt.format(new Date(entry.publishedAt))}
      </time>
      <div className="relative flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5 pr-10">
          <Badge variant={toneBadgeVariant(meta.tone)}>{meta.label}</Badge>
          {entry.labels.map((l) => (
            <Badge key={l.id} variant={toneBadgeVariant(toneOf(l.tone))}>
              {l.name}
            </Badge>
          ))}
        </div>
        {standalone ? (
          <h1 className="text-2xl font-bold tracking-tight">{entry.title}</h1>
        ) : (
          <h2 className="text-xl font-bold tracking-tight">
            <Link href={`/changelog/${entry.slug}`} className="hover:underline">
              {entry.title}
            </Link>
          </h2>
        )}
        {standalone ? (
          body
        ) : (
          <CollapsibleBody title={entry.title}>{body}</CollapsibleBody>
        )}
      </div>
    </article>
  );
}
