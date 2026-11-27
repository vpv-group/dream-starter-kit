import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";

import type { IngestInput } from "../autopilot";
import { looksLikeFeedback } from "./filter";

type Db = SupabaseClient<Database>;

/**
 * Chat → Feedback: scan users' AI chat messages for feedback and send the
 * likely ones to the Autopilot inbox. The chat module is OPTIONAL (feedback
 * only requires notifications), so its tables are read through an untyped
 * client — an app without chat still typechecks — and a missing table means
 * "chat isn't installed", not an error.
 */

interface ChatRow {
  id: string;
  content: string;
  created_at: string;
  thread_id: string;
  thread: { user_id: string | null; channel: string } | null;
}

export interface ScanOptions {
  keywords: string[];
  minLength: number;
  /** `ingestFeedback`, injected so the scan unit-tests. */
  ingest: (db: Db, input: IngestInput) => Promise<string>;
  now?: Date;
  batch?: number;
}

export type ScanResult =
  { skipped: "chat not installed" } | { scanned: number; forwarded: number };

/** PostgREST: relation missing from the schema cache / undefined table. */
const isMissingTable = (code?: string) =>
  code === "PGRST205" || code === "42P01";

/**
 * Read user messages newer than the cursor, forward the ones that look like
 * feedback (permanent accounts only) and advance the cursor. The first run
 * starts from "now": history isn't back-filled.
 */
export async function scanChat(db: Db, opts: ScanOptions): Promise<ScanResult> {
  const now = opts.now ?? new Date();
  const { data: state } = await db
    .from("mod_feedback_chat_scan_state")
    .select("cursor, scanned, forwarded")
    .eq("id", 1)
    .maybeSingle();
  if (!state) {
    await db
      .from("mod_feedback_chat_scan_state")
      .insert({ id: 1, cursor: now.toISOString() })
      .throwOnError();
    return { scanned: 0, forwarded: 0 };
  }

  const chat = db as unknown as SupabaseClient;
  const { data, error } = await chat
    .from("mod_chat_messages")
    .select(
      "id, content, created_at, thread_id, thread:mod_chat_threads!mod_chat_messages_thread_id_fkey!inner(user_id, channel)",
    )
    .eq("role", "user")
    .gt("created_at", state.cursor)
    .order("created_at")
    .limit(opts.batch ?? 200);
  if (error) {
    if (isMissingTable(error.code)) return { skipped: "chat not installed" };
    throw new Error(error.message);
  }
  const messages = data as unknown as ChatRow[];

  const emails = new Map<string, string | null>();
  const emailOf = async (userId: string) => {
    if (!emails.has(userId)) {
      const { data: u } = await db.auth.admin.getUserById(userId);
      emails.set(
        userId,
        u.user && !u.user.is_anonymous ? (u.user.email ?? null) : null,
      );
    }
    return emails.get(userId) ?? null;
  };

  let forwarded = 0;
  let cursor = state.cursor;
  for (const m of messages) {
    cursor = m.created_at;
    const userId = m.thread?.user_id;
    if (!userId) continue; // unlinked channel contact
    if (!looksLikeFeedback(m.content, opts.keywords, opts.minLength)) continue;
    const email = await emailOf(userId);
    if (!email) continue; // anonymous accounts stay out of the inbox
    await opts.ingest(db, {
      source: "chat",
      text: m.content,
      email,
      ref: {
        message_id: m.id,
        thread_id: m.thread_id,
        channel: m.thread?.channel,
      },
    });
    forwarded++;
  }

  await db
    .from("mod_feedback_chat_scan_state")
    .update({
      cursor,
      scanned: state.scanned + messages.length,
      forwarded: state.forwarded + forwarded,
      updated_at: now.toISOString(),
    })
    .eq("id", 1)
    .throwOnError();
  return { scanned: messages.length, forwarded };
}
