import "server-only";

import {
  autopilotPublicRoutes,
  autopilotStaffRoutes,
} from "./autopilot-routes";
import {
  changelogPublicRoutes,
  changelogStaffRoutes,
} from "./changelog-routes";
import { ideaRoutes } from "./idea-routes";
import { insightsRoutes } from "./insights-routes";
import {
  integrationPublicRoutes,
  integrationRoutes,
} from "./integration-routes";
import { publicRoutes as portalRoutes } from "./public-routes";
import { staffRoutes } from "./staff-routes";

export { syncAllConfig } from "./full-sync";
/** For source adapters (feedback-source-chat…): add raw feedback to the Inbox. */
export { ingestFeedback } from "./autopilot";
export type { IngestInput } from "./autopilot";

/** Public routes (members + anonymous visitors, cron). */
export const publicRoutes = {
  ...portalRoutes,
  ...changelogPublicRoutes,
  ...integrationPublicRoutes,
  ...autopilotPublicRoutes,
};

/** Authed (non-anonymous) routes: staff triage, ideas, changelog, trackers. */
export const routes = {
  ...staffRoutes,
  ...ideaRoutes,
  ...changelogStaffRoutes,
  ...integrationRoutes,
  ...autopilotStaffRoutes,
  ...insightsRoutes,
};
