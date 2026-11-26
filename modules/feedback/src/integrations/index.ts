import "server-only";

/**
 * @acme/mod-feedback/integrations — the issue-tracker adapter kit.
 * An adapter module (feedback-adapter-<tool>, requires: ["feedback"])
 * implements IssueTrackerProvider, mounts createIssueTrackerRoutes() as its
 * routes/publicRoutes, registers itself from a migration with
 * `select public.mod_feedback_register_provider('<id>', '<Label>',
 * '/api/mod/feedback-adapter-<tool>', '{"search":true,…}')`, schedules its
 * `GET /cron/sync`, and runs runProviderContractTests() in its tests.
 */
export * from "./types";
export {
  applyExternalSnapshot,
  drainOutbox,
  inboundStage,
  outboundCategory,
  pollProvider,
} from "./engine";
export { createIssueTrackerRoutes, runSync } from "./routes";
export type { TrackerRouteOptions } from "./routes";
