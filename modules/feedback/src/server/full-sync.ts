import type { BasePayload } from "payload";

import { getModuleSettings } from "@acme/mod-kit/payload";

import type { FeedbackSettings } from "../payload/settings";
import { settings } from "../payload/settings";
import { parseEmbedOrigins } from "../shared/embed";
import { DEFAULT_IDEA_STAGES } from "../shared/score";
import { createAdminClient } from "./admin-client";
import {
  writeAllBoards,
  writeEmbedOrigins,
  writeIdeaStages,
  writeStatuses,
  writeTags,
} from "./config-sync";

/**
 * Re-copy ALL feedback config from Payload into Supabase (boards, categories,
 * statuses, tags). Idempotent. Run by the hourly cron, the staff "Resync"
 * action, the seed, and lazily when the portal finds no statuses yet (a
 * fresh install whose settings were never saved still gets the defaults).
 */
export async function syncAllConfig(payload: BasePayload): Promise<{
  boards: number;
  statuses: number;
  tags: number;
}> {
  const db = createAdminClient();
  const s = await getModuleSettings<FeedbackSettings>(payload, settings);
  const boards = await payload.find({
    collection: "mod-feedback-boards",
    limit: 1000,
    depth: 0,
    sort: "_order",
    pagination: false,
    overrideAccess: true,
  });
  await writeStatuses(db, s.statuses);
  // Installs whose settings were saved before stages existed get the defaults.
  await writeIdeaStages(
    db,
    s.ideaStages.length ? s.ideaStages : DEFAULT_IDEA_STAGES,
    s.statuses,
  );
  await writeTags(db, s.tags);
  await writeEmbedOrigins(
    db,
    s.embedEnabled,
    parseEmbedOrigins(s.embedOrigins).origins,
  );
  await writeAllBoards(db, boards.docs);
  return {
    boards: boards.docs.length,
    statuses: s.statuses.length,
    tags: s.tags.length,
  };
}

let ensuring: Promise<unknown> | null = null;

/** Sync once if the status copy is empty (first run on a fresh install). */
export async function ensureConfigSynced(
  getPayload: () => Promise<BasePayload>,
): Promise<void> {
  const db = createAdminClient();
  const { count } = await db
    .from("mod_feedback_statuses")
    .select("id", { count: "exact", head: true });
  const { count: stages } = await db
    .from("mod_feedback_idea_stages")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0 && (stages ?? 0) > 0) return;
  ensuring ??= getPayload()
    .then(syncAllConfig)
    .finally(() => {
      ensuring = null;
    });
  await ensuring;
}
