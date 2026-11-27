import { registerHostServices } from "@acme/mod-kit/server";

/**
 * Core helpers module RSC pages may use (docs/MODULES.md → Host services):
 * the viewer's RLS session client, the auth settings and the branding.
 * Registered on load — imported for its side effect by the frontend layout
 * and payload.config (like the connector broker). Lazy imports keep this
 * file free of load-order cycles with the Payload config. No "server-only"
 * import: payload.config loads it, and the Payload CLI runs outside Next.
 */
registerHostServices({
  getSessionClient: async () => {
    const { createClient } = await import("~/lib/supabase/server");
    return createClient();
  },
  getAuthSettings: async () => {
    const { getAuthSettings } = await import("~/lib/payload");
    return getAuthSettings();
  },
  getBranding: async () => {
    const { getBranding } = await import("~/lib/payload");
    return getBranding();
  },
});
