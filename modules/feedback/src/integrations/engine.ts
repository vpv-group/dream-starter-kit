import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";

import type {
  ExternalIssue,
  IssueTrackerProvider,
  ProviderContext,
  StateCategory,
  StatusMappingRow,
} from "./types";

type Db = SupabaseClient<Database>;

/**
 * Provider-neutral sync engine. Pure mapping (unit-tested) + the two flows:
 *  inbound  — applyExternalSnapshot: issue state → idea stage (cascades);
 *  outbound — drainOutbox: idea stage → issue state, idempotently.
 * Mapping rows are ordered; the FIRST matching row wins in each direction
 * (Canny's status mapping); unmapped states/stages don't sync.
 */

export function inboundStage(
  category: StateCategory,
  rows: StatusMappingRow[],
): string | null {
  return (
    rows.find((r) => r.external === category && r.direction !== "outbound")
      ?.stage ?? null
  );
}

export function outboundCategory(
  stage: string,
  rows: StatusMappingRow[],
): StateCategory | null {
  return (
    rows.find((r) => r.stage === stage && r.direction !== "inbound")
      ?.external ?? null
  );
}

export interface ApplyResult {
  moved: boolean;
  stage: string | null;
  reason?: string;
}

/** Update the link's snapshot and, when mapped, move the idea's stage. */
export async function applyExternalSnapshot(
  db: Db,
  provider: string,
  issue: ExternalIssue,
  rows: StatusMappingRow[],
): Promise<ApplyResult> {
  const { data: link } = await db
    .from("mod_feedback_issue_links")
    .select(
      "id, idea_id, sync_enabled, idea:mod_feedback_ideas!inner(stage_id, sync_locked)",
    )
    .eq("provider", provider)
    .eq("external_id", issue.externalId)
    .maybeSingle();
  if (!link) return { moved: false, stage: null, reason: "not linked" };
  await db
    .from("mod_feedback_issue_links")
    .update({
      title: issue.title,
      url: issue.url,
      key: issue.key,
      state_category: issue.state.category,
      state_raw: issue.state.raw,
      labels: issue.labels,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", link.id);
  const idea = link.idea;
  if (!link.sync_enabled)
    return { moved: false, stage: null, reason: "sync off" };
  if (idea.sync_locked)
    return { moved: false, stage: null, reason: "idea locked" };
  const stage = inboundStage(issue.state.category, rows);
  if (!stage) return { moved: false, stage: null, reason: "unmapped" };
  if (stage === idea.stage_id)
    return { moved: false, stage, reason: "unchanged" };
  const { error } = await db.rpc("mod_feedback_set_idea_stage", {
    _idea: link.idea_id,
    _stage: stage,
    _origin: `provider:${provider}`,
  });
  if (error) throw new Error(error.message);
  return { moved: true, stage };
}

const BACKOFF_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3600_000,
  12 * 3600_000,
];

/** Apply queued idea stage moves to the provider's issues. */
export async function drainOutbox(
  db: Db,
  provider: IssueTrackerProvider,
  ctx: ProviderContext,
  limit = 25,
): Promise<{ applied: number; skipped: number; failed: number }> {
  const { data: rows } = await db
    .from("mod_feedback_sync_outbox")
    .select(
      "id, attempts, desired_stage, link:mod_feedback_issue_links!inner(external_id)",
    )
    .eq("provider", provider.id)
    .is("done_at", null)
    .lte("next_attempt_at", new Date().toISOString())
    .order("id")
    .limit(limit);
  let applied = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const link = row.link;
    const category = outboundCategory(
      row.desired_stage,
      ctx.settings.statusMapping,
    );
    try {
      if (category) {
        const changed = await provider.setState(
          ctx,
          link.external_id,
          category,
        );
        if (changed) applied++;
        else skipped++;
      } else {
        skipped++;
      }
      await db
        .from("mod_feedback_sync_outbox")
        .update({ done_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
    } catch (err) {
      failed++;
      const attempts = row.attempts + 1;
      const delay =
        BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? 3600_000;
      await db
        .from("mod_feedback_sync_outbox")
        .update({
          attempts,
          last_error: (err as Error).message.slice(0, 500),
          next_attempt_at: new Date(Date.now() + delay).toISOString(),
          // Give up after a day of retries; the link stays for a manual "Sync now".
          done_at: attempts >= 8 ? new Date().toISOString() : null,
        })
        .eq("id", row.id);
    }
  }
  return { applied, skipped, failed };
}

/** Poll the provider for changed linked issues and apply each snapshot. */
export async function pollProvider(
  db: Db,
  provider: IssueTrackerProvider,
  ctx: ProviderContext,
): Promise<{ checked: number; moved: number }> {
  if (!provider.pollChanged) return { checked: 0, moved: 0 };
  const [{ data: integration }, { data: links }] = await Promise.all([
    db
      .from("mod_feedback_integrations")
      .select("cursor")
      .eq("provider", provider.id)
      .maybeSingle(),
    db
      .from("mod_feedback_issue_links")
      .select("external_id")
      .eq("provider", provider.id),
  ]);
  const ids = (links ?? []).map((l) => l.external_id);
  if (!ids.length) return { checked: 0, moved: 0 };
  const { issues, cursor } = await provider.pollChanged(
    ctx,
    integration?.cursor ?? null,
    ids,
  );
  let moved = 0;
  for (const issue of issues) {
    const r = await applyExternalSnapshot(
      db,
      provider.id,
      issue,
      ctx.settings.statusMapping,
    );
    if (r.moved) moved++;
  }
  await db
    .from("mod_feedback_integrations")
    .update({
      cursor,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("provider", provider.id);
  return { checked: issues.length, moved };
}
