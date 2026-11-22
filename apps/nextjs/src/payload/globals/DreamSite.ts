import type { GlobalConfig } from "payload";

import { adminFieldAccess, isAdmin } from "../access";

/**
 * This deployment's free site license on meetdream.com (docs/MODULES.md →
 * Site license). Written only by the server (lib/dream/site.ts, with
 * overrideAccess) — registered automatically after the first CMS seed and
 * reported daily. Admins can read it (incl. the key, to copy into the
 * DREAM_LICENSE_KEY repo secret for paid modules); nobody edits it here.
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
      name: "domain",
      type: "text",
      admin: { readOnly: true, description: "Registered domain." },
    },
    {
      name: "licenseKey",
      type: "text",
      access: { read: adminFieldAccess },
      admin: {
        readOnly: true,
        description:
          "The site license key. Add it as the GitHub repository secret " +
          "DREAM_LICENSE_KEY so module ops can install modules. Keep it secret.",
      },
    },
    { name: "licenseKeyPrefix", type: "text", admin: { readOnly: true } },
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
