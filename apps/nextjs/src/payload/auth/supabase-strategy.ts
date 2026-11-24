import type { AuthStrategy } from "payload";

import { withCmsSchemaHeal } from "~/lib/cms/ensure-schema";
import { createClient } from "~/lib/supabase/server";
import { hasStaffRole } from "../access";

/**
 * Supabase -> Payload SSO bridge.
 *
 * Payload authenticates every CMS request from the caller's existing **Supabase**
 * session — there is no separate Payload login or `payload-token`. This runs in the
 * Next.js server (NOT as the least-privilege `payload_cms` DB role): it reads the
 * Supabase session + `profiles.is_staff` via the normal Supabase client (anon key +
 * the user's own JWT, RLS read-own), and provisions the `cms.users` row via Payload's
 * Local API. So the kit's schema isolation (payload_cms touches only `cms`) holds.
 *
 * Authorization is default-deny: only app users flagged `is_staff` (the first signup,
 * plus anyone an admin gives an admin/editor/author role — `is_staff` follows the CMS
 * roles, see hooks/sync-user-to-supabase.ts) are mapped to a Payload user. Everyone
 * else gets no CMS access.
 */
export const SUPABASE_STRATEGY_NAME = "supabase";

export const supabaseStrategy: AuthStrategy = {
  name: SUPABASE_STRATEGY_NAME,
  authenticate: async ({ payload }) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null };

    // Authorization gate: only staff app users may enter the CMS.
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_staff")
      .eq("id", user.id)
      .single();
    if (!profile?.is_staff) return { user: null };

    const findBySupabaseId = async () => {
      // `trash: true` includes soft-deleted rows: a trashed user must be
      // rejected (not silently re-created, which would trip the unique
      // supabaseUserId constraint).
      const { docs } = await payload.find({
        collection: "users",
        where: { supabaseUserId: { equals: user.id } },
        limit: 1,
        trash: true,
        overrideAccess: true,
      });
      return docs[0];
    };

    // JIT-provision the cms.users row, keyed by the stable Supabase user id.
    // This is the first cms.* query of every /admin and /cms-api request, so it
    // carries the schema self-heal: if the cms tables are gone (database reset
    // while the server was up), the committed Payload migrations are applied
    // and the query retried (lib/cms/ensure-schema.ts).
    let cmsUser = await withCmsSchemaHeal(payload, findBySupabaseId);
    if (!cmsUser) {
      const name =
        (user.user_metadata.display_name as string | undefined) ??
        (user.user_metadata.name as string | undefined) ??
        user.email?.split("@")[0];
      try {
        cmsUser = await payload.create({
          collection: "users",
          data: {
            supabaseUserId: user.id,
            email: user.email ?? `${user.id}@users.noreply.local`,
            name,
            roles: ["admin"],
          },
          overrideAccess: true,
        });
      } catch {
        // Lost a concurrent create race (unique supabaseUserId) — re-find.
        cmsUser = await findBySupabaseId();
      }
    }
    if (!cmsUser) return { user: null };

    // Soft-deleted (trashed) users are locked out until restored from the
    // admin Trash view — even if their profile is still flagged staff.
    if (cmsUser.deletedAt) return { user: null };

    // The CMS roles are the source of truth for staff access. A row with no
    // admin/editor/author role is a member even if a stale `is_staff` flag
    // says otherwise (re-saving the user in /admin re-syncs the flag).
    if (!hasStaffRole(cmsUser.roles)) return { user: null };

    return { user: { ...cmsUser, collection: "users" as const } };
  },
};
