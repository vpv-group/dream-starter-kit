import "server-only";

import {
  changelogPublicRoutes,
  changelogStaffRoutes,
} from "./changelog-routes";
import { ideaRoutes } from "./idea-routes";
import { publicRoutes as portalRoutes } from "./public-routes";
import { staffRoutes } from "./staff-routes";

export { syncAllConfig } from "./full-sync";

/** Public routes (members + anonymous visitors, cron). */
export const publicRoutes = { ...portalRoutes, ...changelogPublicRoutes };

/** Authed (non-anonymous) routes: staff triage, ideas, changelog linking. */
export const routes = {
  ...staffRoutes,
  ...ideaRoutes,
  ...changelogStaffRoutes,
};
