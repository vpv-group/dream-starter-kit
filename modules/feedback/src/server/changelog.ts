import type { BasePayload } from "payload";

import { getModuleSettings } from "@acme/mod-kit/payload";
import { notify } from "@acme/mod-notifications/server";

import type { FeedbackSettings } from "../payload/settings";
import { settings as settingsDef } from "../payload/settings";
import { createAdminClient } from "./admin-client";

/**
 * A changelog entry's first publish (Canny: "notify subscribers" + shipped
 * posts): move linked ideas to the configured stage — which moves their
 * posts — WITHOUT the per-post status notification, then tell each voter
 * once that the entry shipped, and email changelog subscribers.
 */

export interface AnnounceEntry {
  id: string | number;
  title: string;
  slug: string;
  excerpt?: string | null;
  linkedIdeas?: string[] | null;
  notifySubscribers?: boolean | null;
  audience?: "everyone" | "members" | null;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function announceChangelog(
  payload: BasePayload,
  entry: AnnounceEntry,
  siteUrl: string,
): Promise<{ ideasMoved: number; notified: number; emailed: number }> {
  const db = createAdminClient();
  const s = await getModuleSettings<FeedbackSettings>(payload, settingsDef);
  const ideas = entry.linkedIdeas ?? [];
  const url = `/changelog/${entry.slug}`;
  let ideasMoved = 0;

  const stage = s.changelogShipStage?.trim();
  if (stage) {
    for (const idea of ideas) {
      const { error } = await db.rpc("mod_feedback_set_idea_stage", {
        _idea: idea,
        _stage: stage,
        _notify: false,
        _origin: "changelog",
      });
      if (error)
        console.error(`[feedback] ship idea ${idea}: ${error.message}`);
      else ideasMoved++;
    }
  }

  const recipients = new Set<string>();
  if (ideas.length) {
    const { data: posts } = await db
      .from("mod_feedback_posts")
      .select("id")
      .in("idea_id", ideas)
      .is("deleted_at", null);
    const postIds = (posts ?? []).map((p) => p.id);
    if (postIds.length) {
      const [votes, subs] = await Promise.all([
        db.from("mod_feedback_votes").select("user_id").in("post_id", postIds),
        db
          .from("mod_feedback_subscriptions")
          .select("user_id")
          .in("post_id", postIds),
      ]);
      for (const v of votes.data ?? []) recipients.add(v.user_id);
      for (const v of subs.data ?? []) recipients.add(v.user_id);
    }
  }

  const subscribers: string[] = [];
  if (entry.notifySubscribers !== false && s.changelogSubscriptions !== false) {
    const { data } = await db
      .from("mod_feedback_changelog_subscribers")
      .select("user_id");
    for (const row of data ?? []) {
      subscribers.push(row.user_id);
      recipients.add(row.user_id);
    }
  }

  let notified = 0;
  if (entry.notifySubscribers !== false) {
    for (const userId of recipients) {
      await notify(db, {
        userId,
        category: "feedback.changelog.published",
        title: `Shipped: ${entry.title}`,
        body: entry.excerpt ?? undefined,
        url,
        entity: { type: "feedback_changelog", id: String(entry.id) },
        sourceModule: "feedback",
        dedupeKey: `feedback:changelog:${entry.id}:${userId}`,
      }).catch((e: unknown) => console.error("[feedback] changelog notify", e));
      notified++;
    }
  }

  // Email subscribers (the notifications module doesn't deliver email yet).
  let emailed = 0;
  for (const userId of subscribers) {
    const { data } = await db.auth.admin.getUserById(userId);
    const email = data.user?.email;
    if (!email || data.user?.is_anonymous) continue;
    const link = `${siteUrl.replace(/\/$/, "")}${url}`;
    await payload
      .sendEmail({
        to: email,
        subject: `New: ${entry.title}`,
        text: `${entry.title}\n\n${entry.excerpt ?? ""}\n\nRead more: ${link}\n\nYou subscribed to product updates; unsubscribe on ${siteUrl}/changelog.`,
        html: `<h2>${escapeHtml(entry.title)}</h2>${entry.excerpt ? `<p>${escapeHtml(entry.excerpt)}</p>` : ""}<p><a href="${link}">Read the update</a></p><p style="color:#888;font-size:12px">You subscribed to product updates. Unsubscribe on <a href="${siteUrl}/changelog">the changelog</a>.</p>`,
      })
      .then(() => emailed++)
      .catch((e: unknown) => console.error("[feedback] changelog email", e));
  }
  return { ideasMoved, notified, emailed };
}
