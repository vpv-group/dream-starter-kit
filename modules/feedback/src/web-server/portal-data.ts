import "server-only";

import config from "@payload-config";
import { getPayload } from "payload";

import { getModuleSettings } from "@acme/mod-kit/payload";

import type { FeedbackSettings } from "../payload/settings";
import type { PortalTab } from "../web/components/portal-header";
import { listBoards, listStatuses } from "../data";
import { settings } from "../payload/settings";
import { ensureConfigSynced } from "../server/full-sync";
import { createServerSupabase } from "./supabase";

/** Everything the portal shell needs, loaded once per request. */
export async function loadPortal() {
  const payload = await getPayload({ config });
  await ensureConfigSynced(() => Promise.resolve(payload)).catch((e: unknown) =>
    console.error("[feedback] config sync", e),
  );
  const db = await createServerSupabase();
  const [s, boards, statuses, auth, staffRes] = await Promise.all([
    getModuleSettings<FeedbackSettings>(payload, settings),
    listBoards(db),
    listStatuses(db),
    db.auth.getUser(),
    db.rpc("mod_feedback_is_staff"),
  ]);
  const user = auth.data.user;
  const tabs: PortalTab[] = s.portalTabs
    .filter((t) => t.enabled !== false)
    .map((t) => ({
      tab: t.tab,
      label: t.label,
      href: t.tab === "feedback" ? "/feedback" : `/${t.tab}`,
    }));
  return {
    db,
    payload,
    settings: s,
    boards,
    statuses: statuses.filter((st) => st.id),
    tabs,
    viewer: user
      ? {
          id: user.id,
          anonymous: Boolean(user.is_anonymous),
          staff: Boolean(staffRes.data),
        }
      : null,
  };
}

export type Portal = Awaited<ReturnType<typeof loadPortal>>;

/** Anonymous-capable writes allowed on this board (board rule, else global). */
export function anonFor(
  portal: Portal,
  board: { anon_votes: string; anon_posts: string; anon_comments: string },
) {
  const pick = (rule: string, global: boolean) =>
    rule === "allow" ? true : rule === "deny" ? false : global;
  return {
    votes: pick(board.anon_votes, portal.settings.anonVotes ?? true),
    posts: pick(board.anon_posts, portal.settings.anonPosts ?? false),
    comments: pick(board.anon_comments, portal.settings.anonComments ?? false),
  };
}
