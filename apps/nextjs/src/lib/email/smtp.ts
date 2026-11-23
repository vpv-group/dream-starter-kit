import type { NodemailerAdapterArgs } from "@payloadcms/email-nodemailer";

/** The env this reads (raw `process.env`: the Payload CLI loads the config too). */
export interface SmtpEnv {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM_ADDRESS?: string;
  SMTP_FROM_NAME?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

const set = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

/**
 * Nodemailer settings for Payload's email adapter (payload.config.ts `email`),
 * from the SMTP_* env (.env.example → "Outgoing email"). Returns `null` when
 * SMTP_HOST is unset: Payload then logs emails to the console instead of
 * sending them. Port 465 uses implicit TLS; other ports upgrade with STARTTLS
 * when the server offers it.
 */
export function resolveSmtpConfig(env: SmtpEnv): NodemailerAdapterArgs | null {
  const host = set(env.SMTP_HOST);
  if (!host) return null;
  const port = Number(set(env.SMTP_PORT) ?? 587);
  const user = set(env.SMTP_USER);
  const pass = set(env.SMTP_PASS);

  let appHost = "localhost";
  try {
    appHost = new URL(set(env.NEXT_PUBLIC_APP_URL) ?? "http://localhost")
      .hostname;
  } catch {
    /* malformed — keep localhost */
  }

  return {
    defaultFromAddress: set(env.SMTP_FROM_ADDRESS) ?? `no-reply@${appHost}`,
    defaultFromName: set(env.SMTP_FROM_NAME) ?? "Account security",
    // Don't block boot on an SMTP round-trip; a send failure is logged where
    // the email is sent (best-effort notices).
    skipVerify: true,
    transportOptions: {
      host,
      port,
      secure: port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
    },
  };
}
