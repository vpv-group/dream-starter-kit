import type { CollectionAfterChangeHook } from "payload";

import type { User } from "@acme/cms";

// Relative (not `~/`) so the unit test resolves it without the Next alias.
import { phoneChangedEmail } from "../../lib/email/security-notices";

const norm = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Emails the member a security notice when their contact phone changes —
 * whoever changed it: the member on /profile (synced in via
 * /api/cms/mirror-self → lib/cms/mirror-user.ts) or an admin in /admin.
 * The phone is contact metadata (profiles.phone), not a Supabase Auth phone,
 * so Supabase has no notification for it.
 *
 * Best-effort and AFTER the save: a send failure is logged, never fails the
 * write. Sent via Payload's email adapter (SMTP_*; unset → logged to the
 * console). Skips creates (first mirror of an account), trashed rows and rows
 * without an email.
 */
export const notifyContactChange: CollectionAfterChangeHook<User> = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation !== "update" || doc.deletedAt) return doc;
  const email = norm(doc.email);
  const previous = norm(previousDoc.phone);
  const next = norm(doc.phone);
  if (!email || previous === next) return doc;

  try {
    const { subject, html, text } = phoneChangedEmail({
      email,
      previous,
      next,
    });
    await req.payload.sendEmail({ to: email, subject, html, text });
    req.payload.logger.info(
      `[notify-contact-change] phone notice sent for user ${String(doc.id)}`,
    );
  } catch (error) {
    req.payload.logger.error(
      `[notify-contact-change] could not email user ${String(doc.id)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return doc;
};
