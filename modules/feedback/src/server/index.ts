import "server-only";

import {
  autopilotPublicRoutes,
  autopilotStaffRoutes,
} from "./autopilot-routes";
import {
  changelogPublicRoutes,
  changelogStaffRoutes,
} from "./changelog-routes";
import { digestPublicRoutes, digestStaffRoutes } from "./digest-routes";
import { embedPublicRoutes, embedRoutes } from "./embed-routes";
import { ideaRoutes } from "./idea-routes";
import { insightsRoutes } from "./insights-routes";
import {
  integrationPublicRoutes,
  integrationRoutes,
} from "./integration-routes";
import { publicRoutes as portalRoutes } from "./public-routes";
import { staffRoutes } from "./staff-routes";

export { syncAllConfig } from "./full-sync";
/** Remote MCP server tools + collections (manifest server.mcp). */
export { mcp } from "./mcp";
/** For feedback sources (other modules, integrations): add raw feedback to the Inbox. */
export { ingestFeedback } from "./autopilot";
export type { IngestInput } from "./autopilot";

/** Public routes (members + anonymous visitors, cron). */
export const publicRoutes = {
  ...portalRoutes,
  ...changelogPublicRoutes,
  ...integrationPublicRoutes,
  ...autopilotPublicRoutes,
  ...digestPublicRoutes,
  ...embedPublicRoutes,
};

/** Authed (non-anonymous) routes: staff triage, ideas, changelog, trackers. */
export const routes = {
  ...staffRoutes,
  ...ideaRoutes,
  ...changelogStaffRoutes,
  ...integrationRoutes,
  ...autopilotStaffRoutes,
  ...insightsRoutes,
  ...digestStaffRoutes,
  ...embedRoutes,
};
