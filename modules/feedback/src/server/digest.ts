import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";

import type { Insights } from "../shared/insights";
import { delta } from "../shared/insights";

/**
 * The staff digest: pure `buildDigest` (unit-tested) plus `runDigest`, which
 * gathers data with the service-role client, claims the period, and emails
 * every opted-in staff member. Sent only when something happened.
 */

type Db = SupabaseClient<Database>;

export type DigestCadence = "daily" | "weekly" | "never";

export interface DigestData {
  cadence: "daily" | "weekly";
  insights: Insights;
  pendingApproval: number;
  stale: number;
  autopilotPending: number;
  newPosts: { title: string; url: string; votes: number }[];
  appName: string;
  siteUrl: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Period key, or null when no digest is due at `now` (weekly → Mondays). */
export function digestPeriod(cadence: DigestCadence, now: Date): string | null {
  if (cadence === "never") return null;
  const day = now.toISOString().slice(0, 10);
  if (cadence === "daily") return `daily:${day}`;
  return now.getUTCDay() === 1 ? `weekly:${day}` : null;
}

export function hasActivity(d: DigestData): boolean {
  const t = d.insights.totals;
  return (
    t.posts.current +
      t.votes.current +
      t.comments.current +
      t.shipped.current +
      d.pendingApproval +
      d.autopilotPending >
    0
  );
}

export function buildDigest(d: DigestData): {
  subject: string;
  text: string;
  html: string;
} {
  const t = d.insights.totals;
  const period = d.cadence === "daily" ? "yesterday" : "this past week";
  const subject = `${d.appName} feedback ${d.cadence === "daily" ? "daily" : "weekly"} digest: ${t.posts.current} new ${t.posts.current === 1 ? "post" : "posts"}, ${t.votes.current} ${t.votes.current === 1 ? "vote" : "votes"}`;
  const base = d.siteUrl.replace(/\/$/, "");
  const fmtDelta = (k: keyof Insights["totals"]) => {
    const c = delta(t[k]);
    return c === null || c === 0 ? "" : ` (${c > 0 ? "+" : ""}${c}%)`;
  };
  const stats: [string, number, string][] = [
    ["New posts", t.posts.current, fmtDelta("posts")],
    ["Votes", t.votes.current, fmtDelta("votes")],
    ["Comments", t.comments.current, fmtDelta("comments")],
    ["Shipped", t.shipped.current, fmtDelta("shipped")],
  ];
  const queues: [string, number][] = [
    ["Waiting for approval", d.pendingApproval],
    ["Autopilot suggestions", d.autopilotPending],
    ["Stale in progress", d.stale],
  ].filter(([, n]) => (n as number) > 0) as [string, number][];
  const top = d.insights.topPosts.slice(0, 5);

  const text = [
    `Feedback ${period}:`,
    ...stats.map(([l, n, x]) => `- ${l}: ${n}${x}`),
    ...(queues.length
      ? ["", "Needs attention:", ...queues.map(([l, n]) => `- ${l}: ${n}`)]
      : []),
    ...(top.length
      ? [
          "",
          "Most voted:",
          ...top.map(
            (p) =>
              `- ${p.title} (+${p.gained}) ${base}/feedback/${p.boardSlug}/p/${p.slug}`,
          ),
        ]
      : []),
    ...(d.newPosts.length
      ? ["", "New posts:", ...d.newPosts.map((p) => `- ${p.title} ${p.url}`)]
      : []),
    "",
    `Open the inbox: ${base}/a/feedback`,
  ].join("\n");

  const li = (inner: string) => `<li style="margin:4px 0">${inner}</li>`;
  const section = (title: string, items: string[]) =>
    items.length
      ? `<h3 style="font-size:14px;margin:20px 0 6px">${esc(title)}</h3><ul style="padding-left:18px;margin:0">${items.join("")}</ul>`
      : "";
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">
<p style="margin:0 0 12px">Feedback ${esc(period)}:</p>
<table style="border-collapse:collapse">${stats
    .map(
      ([l, n, x]) =>
        `<tr><td style="padding:2px 16px 2px 0;color:#555">${esc(l)}</td><td style="padding:2px 0;font-weight:600">${n}${esc(x)}</td></tr>`,
    )
    .join("")}</table>
${section(
  "Needs attention",
  queues.map(([l, n]) => li(`${esc(l)}: <strong>${n}</strong>`)),
)}
${section(
  "Most voted",
  top.map((p) =>
    li(
      `<a href="${esc(`${base}/feedback/${p.boardSlug}/p/${p.slug}`)}">${esc(p.title)}</a> (+${p.gained})`,
    ),
  ),
)}
${section(
  "New posts",
  d.newPosts.map((p) => li(`<a href="${esc(p.url)}">${esc(p.title)}</a>`)),
)}
<p style="margin:20px 0 0"><a href="${esc(`${base}/a/feedback`)}">Open the inbox</a></p>
<p style="margin:16px 0 0;color:#777;font-size:12px">You get this because you're staff on ${esc(d.appName)}. Turn it off in the feedback workspace.</p>
</div>`;
  return { subject, text, html };
}

export interface RunDigestDeps {
  db: Db;
  sendEmail: (msg: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<unknown>;
  cadence: DigestCadence;
  staleAfterWeeks: number;
  appName: string;
  siteUrl: string;
  now?: Date;
}

/** Gather, claim the period, and send. Returns what happened. */
export async function runDigest(deps: RunDigestDeps): Promise<{
  skipped?: string;
  period?: string;
  sent?: number;
}> {
  const now = deps.now ?? new Date();
  const period = digestPeriod(deps.cadence, now);
  if (!period) return { skipped: "not due" };
  const { db } = deps;
  const days = deps.cadence === "daily" ? 1 : 7;
  const since = new Date(now.getTime() - days * 86400_000).toISOString();

  const { data: insights, error } = await db.rpc("mod_feedback_insights", {
    _since: since,
  });
  if (error) throw new Error(error.message);
  const ins = insights as unknown as Insights;

  const { count: pendingApproval } = await db
    .from("mod_feedback_posts")
    .select("id", { count: "exact", head: true })
    .eq("approval_state", "pending")
    .is("deleted_at", null);
  const { count: autopilotPending } = await db
    .from("mod_feedback_inbox")
    .select("id", { count: "exact", head: true })
    .eq("state", "pending");
  const { data: active } = await db
    .from("mod_feedback_statuses")
    .select("id")
    .eq("type", "active");
  const cutoff = new Date(
    now.getTime() - deps.staleAfterWeeks * 7 * 86400_000,
  ).toISOString();
  const { count: stale } = active?.length
    ? await db
        .from("mod_feedback_posts")
        .select("id", { count: "exact", head: true })
        .in(
          "status_id",
          active.map((a) => a.id),
        )
        .lt("status_changed_at", cutoff)
        .is("deleted_at", null)
        .is("merged_into_id", null)
    : { count: 0 };
  const { data: fresh } = await db
    .from("mod_feedback_posts")
    .select("title, slug, vote_count, mod_feedback_boards!inner(slug)")
    .gte("created_at", since)
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .is("merged_into_id", null)
    .order("vote_count", { ascending: false })
    .limit(8);
  const base = deps.siteUrl.replace(/\/$/, "");

  const data: DigestData = {
    cadence: deps.cadence === "daily" ? "daily" : "weekly",
    insights: ins,
    pendingApproval: pendingApproval ?? 0,
    autopilotPending: autopilotPending ?? 0,
    stale: stale ?? 0,
    newPosts: (fresh ?? []).map((p) => ({
      title: p.title,
      votes: p.vote_count,
      url: `${base}/feedback/${p.mod_feedback_boards.slug}/p/${p.slug}`,
    })),
    appName: deps.appName,
    siteUrl: deps.siteUrl,
  };
  if (!hasActivity(data)) return { skipped: "nothing happened", period };

  // Claim the period first: a retried cron can't send it twice.
  const claim = await db
    .from("mod_feedback_digest_runs")
    .insert({ period_key: period });
  if (claim.error) return { skipped: "already sent", period };

  const { data: staff } = await db
    .from("profiles")
    .select("id")
    .eq("is_staff", true);
  const { data: optedOut } = await db
    .from("mod_feedback_staff_prefs")
    .select("user_id")
    .eq("digest", false);
  const off = new Set((optedOut ?? []).map((r) => r.user_id));
  const message = buildDigest(data);
  let sent = 0;
  for (const s of staff ?? []) {
    if (off.has(s.id)) continue;
    const { data: user } = await db.auth.admin.getUserById(s.id);
    const email = user.user?.email;
    if (!email) continue;
    try {
      await deps.sendEmail({ to: email, ...message });
      sent++;
    } catch (err) {
      console.error(`[feedback] digest to ${s.id} failed`, err);
    }
  }
  await db
    .from("mod_feedback_digest_runs")
    .update({ recipients: sent })
    .eq("period_key", period);
  return { period, sent };
}
