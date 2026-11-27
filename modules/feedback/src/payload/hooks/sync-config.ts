import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  PayloadRequest,
} from "payload";

import type {
  BoardDoc,
  IdeaStageInput,
  StatusInput,
} from "../../server/config-sync";
import { createAdminClient } from "../../server/admin-client";
import {
  writeAllBoards,
  writeEmbedOrigins,
  writeIdeaStages,
  writeStatuses,
  writeTags,
} from "../../server/config-sync";
import { parseEmbedOrigins } from "../../shared/embed";
import { DEFAULT_IDEA_STAGES } from "../../shared/score";

/**
 * Copy Payload config into Supabase after every save (see
 * server/config-sync.ts). Failures are logged, never thrown: the save in
 * /admin succeeds, and the hourly resync (GET /cron/config-sync) repairs the
 * copy. Nested Local API calls pass `req` (CLAUDE.md → Conventions).
 */

async function allBoards(req: PayloadRequest): Promise<BoardDoc[]> {
  const res = await req.payload.find({
    collection: "mod-feedback-boards",
    limit: 1000,
    depth: 0,
    sort: "_order",
    pagination: false,
    req,
  });
  return res.docs;
}

async function syncBoards(req: PayloadRequest) {
  try {
    await writeAllBoards(createAdminClient(), await allBoards(req));
  } catch (err) {
    req.payload.logger.error(
      `[feedback] board sync failed: ${(err as Error).message}`,
    );
  }
}

export const syncBoardsAfterChange: CollectionAfterChangeHook = async ({
  doc,
  req,
  context,
}) => {
  if (!context.skipFeedbackSync) await syncBoards(req);
  return doc as unknown;
};

export const syncBoardsAfterDelete: CollectionAfterDeleteHook = async ({
  doc,
  req,
  context,
}) => {
  if (!context.skipFeedbackSync) await syncBoards(req);
  return doc as unknown;
};

export const syncSettingsAfterChange: GlobalAfterChangeHook = async ({
  doc,
  req,
}) => {
  const settings = doc as {
    statuses?: StatusInput[];
    ideaStages?: IdeaStageInput[];
    tags?: { key?: string | null; name: string }[];
    embedEnabled?: boolean | null;
    embedOrigins?: string | null;
  };
  try {
    const db = createAdminClient();
    if (settings.statuses?.length) {
      await writeStatuses(db, settings.statuses);
      await writeIdeaStages(
        db,
        settings.ideaStages?.length ? settings.ideaStages : DEFAULT_IDEA_STAGES,
        settings.statuses,
      );
    }
    await writeTags(db, settings.tags ?? []);
    await writeEmbedOrigins(
      db,
      settings.embedEnabled,
      parseEmbedOrigins(settings.embedOrigins).origins,
    );
  } catch (err) {
    req.payload.logger.error(
      `[feedback] settings sync failed: ${(err as Error).message}`,
    );
  }
  return doc as unknown;
};
