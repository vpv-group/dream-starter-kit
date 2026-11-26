import type { Payload } from "payload";

import { withCmsSchemaHeal } from "./ensure-schema";

/**
 * Whether the CMS has been seeded with the kit's demo content. Mirrors the
 * bail-out check in `payload/seed.ts#seedCmsContent` (pages exist ⇒ seeded) —
 * shared by the seed endpoint (status + idempotency) and `/welcome` (which
 * routes staff straight to /admin once seeding has happened, so returning
 * admins never see the /cms-setup progress screen again).
 *
 * Self-heals a wiped cms schema before answering (lib/cms/ensure-schema.ts);
 * any other failure propagates to the caller.
 */
export async function isCmsSeeded(payload: Payload): Promise<boolean> {
  // count(), not find({ limit: 0 }): limit 0 means "no pagination" in the
  // Postgres adapter, which loaded EVERY page at depth 2 just to count them.
  const pages = await withCmsSchemaHeal(payload, () =>
    payload.count({ collection: "pages", overrideAccess: true }),
  );
  return pages.totalDocs > 0;
}
