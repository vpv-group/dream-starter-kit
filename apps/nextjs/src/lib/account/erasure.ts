import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Payload } from "payload";

/** Buckets whose objects live under `<user_id>/…` (owner-folder RLS). */
const USER_BUCKETS = ["user-files", "chat-uploads", "avatars"] as const;

export interface ErasureResult {
  cmsUsersDeleted: number;
  storageObjectsDeleted: number;
  /** The auth user still exists (deletion failed or was refused): nothing erased. */
  skipped?: "user-exists";
}

/** The storage + auth admin surface erasure needs (the service-role client). */
type AdminClient = Pick<SupabaseClient, "storage" | "rpc"> & {
  auth: { admin: Pick<SupabaseClient["auth"]["admin"], "getUserById"> };
};

/** Every object path under `prefix` in a bucket, descending into folders. */
async function listAll(
  admin: AdminClient,
  bucket: string,
  prefix: string,
): Promise<string[] | null> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) {
      // A bucket that doesn't exist (module not installed) is not an error.
      if (/not found/i.test(error.message)) return null;
      throw new Error(`erasure: list ${bucket}: ${error.message}`);
    }
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // Folders come back without an id.
      if (entry.id === null) {
        paths.push(...((await listAll(admin, bucket, path)) ?? []));
      } else {
        paths.push(path);
      }
    }
    if (data.length < 1000) return paths;
  }
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
  deps: { admin?: AdminClient } = {},
): Promise<ErasureResult> {
  const admin =
    deps.admin ?? (await import("../supabase/admin")).createAdminClient();

  // The job is queued before the auth user is deleted (so a queueing failure
  // can stop the deletion). If the deletion then failed or was refused, the
  // account still exists and must not be erased.
  const existing = await admin.auth.admin.getUserById(supabaseUserId);
  if (existing.data.user) {
    return {
      cmsUsersDeleted: 0,
      storageObjectsDeleted: 0,
      skipped: "user-exists",
    };
  }
  if (existing.error && existing.error.status !== 404) {
    throw new Error(`erasure: look up user: ${existing.error.message}`);
  }

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
      // A user already in the admin Trash is still erased, permanently.
      trash: true,
      overrideAccess: true,
    });
  }

  let storageObjectsDeleted = 0;
  for (const bucket of USER_BUCKETS) {
    const paths = await listAll(admin, bucket, supabaseUserId);
    if (!paths) continue;
    for (let i = 0; i < paths.length; i += 1000) {
      const batch = paths.slice(i, i + 1000);
      const { error: rmError } = await admin.storage.from(bucket).remove(batch);
      if (rmError)
        throw new Error(`erasure: remove ${bucket}: ${rmError.message}`);
      storageObjectsDeleted += batch.length;
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
