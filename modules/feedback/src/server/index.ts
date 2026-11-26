import "server-only";

import { ideaRoutes } from "./idea-routes";
import { staffRoutes } from "./staff-routes";

export { publicRoutes } from "./public-routes";
export { syncAllConfig } from "./full-sync";

/** Authed (non-anonymous) routes: staff triage + ideas. */
export const routes = { ...staffRoutes, ...ideaRoutes };
