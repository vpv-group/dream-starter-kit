import type { CollectionAfterChangeHook } from "payload";
import { revalidateTag } from "next/cache";
import { after } from "next/server";

import type { AnnounceEntry } from "../../server/changelog";

export const CHANGELOG_TAG = "mod-feedback-changelog";

/** Absolute site URL for links in emails (Payload's serverURL, else the app URL). */
function siteUrl(serverURL: string | undefined): string {
  if (serverURL) return serverURL;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Run after the response when inside a request; otherwise just start it. */
function later(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task().catch((e: unknown) =>
      console.error("[feedback] changelog task", e),
    );
  }
}

/**
 * Every save refreshes the cached RSS/changelog; the FIRST publish (no
 * announcedAt yet) stamps publishedAt/announcedAt and announces the entry
 * (server/changelog.ts) after the response. Scheduled publishing goes
 * through the same hook when the job publishes the draft.
 */
export const changelogAfterChange: CollectionAfterChangeHook = async ({
  doc,
  req,
  context,
}) => {
  try {
    revalidateTag(CHANGELOG_TAG, { expire: 0 });
  } catch {
    // Outside a Next request (CLI seed): nothing cached to refresh.
  }
  const entry = doc as AnnounceEntry & {
    _status?: string;
    announcedAt?: string | null;
    publishedAt?: string | null;
  };
  if (
    context.skipChangelogAnnounce ||
    entry._status !== "published" ||
    entry.announcedAt
  ) {
    return doc as unknown;
  }
  const now = new Date().toISOString();
  await req.payload.update({
    collection: "mod-feedback-changelog",
    id: entry.id,
    data: { announcedAt: now, publishedAt: entry.publishedAt ?? now },
    context: { skipChangelogAnnounce: true },
    overrideAccess: true,
    req,
  });
  const payload = req.payload;
  // Loaded lazily: it pulls server-only modules the Payload CLI can't import.
  const { announceChangelog } = await import("../../server/changelog");
  later(() =>
    announceChangelog(payload, entry, siteUrl(payload.config.serverURL)).then(
      (r) =>
        payload.logger.info(
          `[feedback] announced changelog ${entry.slug}: ${r.ideasMoved} ideas shipped, ${r.notified} notified, ${r.emailed} emailed`,
        ),
    ),
  );
  return doc as unknown;
};
