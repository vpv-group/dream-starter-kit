import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";

import { looksLikeFeedback } from "./filter";

type Db = SupabaseClient<Database>;

export interface ScanOptions {
  keywords: string[];
  minLength: number;
  /** Feedback's `ingestFeedback`, injected so the scan unit-tests. */
  ingest: (
    db: Db,
    input: {
      source: string;
      text: string;
      email?: string | null;
      name?: string | null;
      ref?: Record<string, unknown>;
    },
  ) => Promise<string>;
  now?: Date;
  batch?: number;
}

/**
 * Read user messages newer than the cursor, forward the ones that look like
 * feedback (from permanent accounts only) to the Feedback inbox, and advance
 * the cursor. The first run starts from "now": history isn't back-filled.
 */
export async function scanChat(
  db: Db,
  opts: ScanOptions,
): Promise<{ scanned: number; forwarded: number }> {
  const now = opts.now ?? new Date();
  const { data: state } = await db
    .from("mod_feedback_source_chat_state")
    .select("cursor, scanned, forwarded")
    .eq("id", 1)
    .maybeSingle();
  if (!state) {
    await db
      .from("mod_feedback_source_chat_state")
      .insert({ id: 1, cursor: now.toISOString() })
      .throwOnError();
    return { scanned: 0, forwarded: 0 };
  }

  const { data: messages, error } = await db
    .from("mod_chat_messages")
    .select(
      "id, content, created_at, thread_id, mod_chat_threads!mod_chat_messages_thread_id_fkey!inner(user_id, channel)",
    )
    .eq("role", "user")
    .gt("created_at", state.cursor)
    .order("created_at")
    .limit(opts.batch ?? 200);
  if (error) throw new Error(error.message);

  const emails = new Map<string, string | null>();
  const emailOf = async (userId: string) => {
    if (!emails.has(userId)) {
      const { data } = await db.auth.admin.getUserById(userId);
      const u = data.user;
      emails.set(userId, u && !u.is_anonymous ? (u.email ?? null) : null);
    }
    return emails.get(userId) ?? null;
  };

  let forwarded = 0;
  let cursor = state.cursor;
  for (const m of messages) {
    cursor = m.created_at;
    const thread = m.mod_chat_threads;
    if (!thread.user_id) continue; // unlinked channel contact
    if (!looksLikeFeedback(m.content, opts.keywords, opts.minLength)) continue;
    const email = await emailOf(thread.user_id);
    if (!email) continue; // anonymous accounts stay out of the inbox
    await opts.ingest(db, {
      source: "chat",
      text: m.content,
      email,
      ref: {
        message_id: m.id,
        thread_id: m.thread_id,
        channel: thread.channel,
      },
    });
    forwarded++;
  }

  const scanned = messages.length;
  await db
    .from("mod_feedback_source_chat_state")
    .update({
      cursor,
      scanned: state.scanned + scanned,
      forwarded: state.forwarded + forwarded,
      updated_at: now.toISOString(),
    })
    .eq("id", 1)
    .throwOnError();
  return { scanned, forwarded };
}
