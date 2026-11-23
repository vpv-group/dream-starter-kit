/**
 * Security-notice emails the app sends itself (Payload `sendEmail`, SMTP via
 * lib/email/smtp.ts). Supabase Auth sends its own auth emails, including the
 * "password changed" notice for a member's own change
 * (supabase/templates/password_changed_notification.html); these cover the
 * changes Supabase doesn't see or doesn't notify about:
 *
 *  - the contact phone (`profiles.phone` / `cms.users.phone` — not a Supabase
 *    Auth phone, so there's no Supabase notification for it);
 *  - a password an admin sets from /admin (auth.admin.updateUserById).
 */

export interface NoticeEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );

/** "+1 (555) 010-0199" → "ending in 0199" — never echo the full number. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `ending in ${digits.slice(-4)}` : "(hidden)";
}

const FOOTER_TEXT =
  "If this was you, there's nothing else to do. If it wasn't, sign in, change your password and review your account — someone may have access to it.";

function render(heading: string, lines: string[]): NoticeEmail {
  const html = [
    `<h2>${escapeHtml(heading)}</h2>`,
    ...lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    `<p>${escapeHtml(FOOTER_TEXT)}</p>`,
  ].join("\n");
  const text = [heading, "", ...lines, "", FOOTER_TEXT].join("\n");
  return { subject: heading, html, text };
}

/** The account's contact phone number was added, changed or removed. */
export function phoneChangedEmail(input: {
  email: string;
  previous: string | null;
  next: string | null;
}): NoticeEmail {
  const { email, previous, next } = input;
  if (!next) {
    return render("Your phone number was removed", [
      `The phone number (${maskPhone(previous ?? "")}) was removed from the account ${email}.`,
    ]);
  }
  return render("Your phone number was changed", [
    previous
      ? `The phone number on the account ${email} was changed to a number ${maskPhone(next)}.`
      : `A phone number ${maskPhone(next)} was added to the account ${email}.`,
  ]);
}

/** An admin set this account's password from /admin. */
export function passwordSetByAdminEmail(input: { email: string }): NoticeEmail {
  return render("Your password was changed", [
    `An administrator set a new password for the account ${input.email}.`,
    "Ask your administrator for it, or reset it yourself from the sign-in page.",
  ]);
}
