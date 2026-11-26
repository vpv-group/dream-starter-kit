import "server-only";

import type { Payload } from "payload";

import { createAdminClient } from "../supabase/admin";

/** Buckets whose objects live under `<user_id>/…` (owner-folder RLS). */
const USER_BUCKETS = ["user-files", "chat-uploads", "avatars"] as const;

export interface ErasureResult {
  cmsUsersDeleted: number;
  storageObjectsDeleted: number;
}

/**
 * After an auth user is deleted (the `public` cascade has already removed
 * their rows), remove what lives elsewhere: their Payload `users` row
 * (permanently — not to the trash) and their storage objects. Idempotent, so
 * the job can retry safely. Content they authored keeps existing; Payload
 * nulls the author relationship.
 */
export async function eraseAccountOutsidePublic(
  payload: Payload,
  supabaseUserId: string,
): Promise<ErasureResult> {
  const { docs } = await payload.find({
    collection: "users",
    where: { supabaseUserId: { equals: supabaseUserId } },
    trash: true,
    depth: 0,
    limit: 10,
    overrideAccess: true,
  });
  for (const doc of docs) {
    await payload.delete({
      collection: "users",
      id: doc.id,
      overrideAccess: true,
    });
  }

  const admin = createAdminClient();
  let storageObjectsDeleted = 0;
  for (const bucket of USER_BUCKETS) {
    for (;;) {
      const { data: objects, error } = await admin.storage
        .from(bucket)
        .list(supabaseUserId, { limit: 1000 });
      if (error) {
        // A bucket that doesn't exist (module not installed) is not an error.
        if (/not found/i.test(error.message)) break;
        throw new Error(`erasure: list ${bucket}: ${error.message}`);
      }
      if (objects.length === 0) break;
      const paths = objects.map((o) => `${supabaseUserId}/${o.name}`);
      const { error: rmError } = await admin.storage.from(bucket).remove(paths);
      if (rmError)
        throw new Error(`erasure: remove ${bucket}: ${rmError.message}`);
      storageObjectsDeleted += paths.length;
      if (objects.length < 1000) break;
    }
  }

  await admin.rpc("audit_log_event", {
    _action: "account.erased",
    _actor_type: "system",
    _entity_type: "user",
    _entity_id: supabaseUserId,
    _meta: { cmsUsersDeleted: docs.length, storageObjectsDeleted },
  });

  return { cmsUsersDeleted: docs.length, storageObjectsDeleted };
}
