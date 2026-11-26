import type { GlobalConfig } from "payload";

import { isAdmin } from "../access";

/**
 * This deployment's free site license on meetdream.com (docs/MODULES.md →
 * Site license). Written only by the server (lib/dream/site.ts, with
 * overrideAccess) — registered automatically after the first CMS seed and
 * reported daily. Admins see the key's prefix only: the full key is used by
 * the server (updates, paid modules) and never shown or sent to the browser
 * (rotate it from meetdream.com). Nobody edits it here.
 * Without a key, a "Generate license key" button registers on demand
 * (/api/cms/dream-site/register).
 */
export const DreamSite: GlobalConfig = {
  slug: "dream-site",
  label: "Site License",
  admin: {
    group: "System",
    description:
      "Your free Dream Starter Kit site license from meetdream.com: kit " +
      "updates and free modules for life. Registered automatically after " +
      "setup on a public domain (never on localhost; set DREAM_TELEMETRY=off " +
      "to opt out). To use paid modules, put " +
      "your meetdream.com plan on this site at meetdream.com/a/modules.",
  },
  access: { read: isAdmin, update: () => false },
  fields: [
    {
      // "Generate license key" while there is no key (sites set up before
      // site licenses, or a failed registration) — no data stored.
      name: "register",
      type: "ui",
      admin: {
        components: {
          Field: "~/payload/components/DreamSiteRegister#DreamSiteRegister",
        },
      },
    },
    {
      name: "domain",
      type: "text",
      admin: { readOnly: true, description: "Registered domain." },
    },
    {
      // Server-only (read with overrideAccess): never returned by the API or
      // shown in the admin.
      name: "licenseKey",
      type: "text",
      access: { read: () => false },
      admin: { hidden: true },
    },
    {
      name: "licenseKeyPrefix",
      type: "text",
      label: "License key",
      admin: {
        readOnly: true,
        description:
          "The start of this site's key. The full key never leaves the " +
          "server; rotate it from meetdream.com.",
      },
    },
    { name: "registeredAt", type: "date", admin: { readOnly: true } },
    { name: "lastReportedAt", type: "date", admin: { readOnly: true } },
    {
      name: "lastError",
      type: "text",
      admin: { readOnly: true, description: "Last registry error, if any." },
    },
    // Internal: the challenge nonce served at /.well-known/dream-site.json
    // while registering, and the throttle stamp.
    { name: "nonce", type: "text", admin: { hidden: true } },
    { name: "lastAttemptAt", type: "date", admin: { hidden: true } },
  ],
};
