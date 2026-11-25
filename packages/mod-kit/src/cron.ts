import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The bearer secret that guards scheduled endpoints: Payload's jobs runner and
 * any module cron route registered with `kit_register_app_schedule()`.
 * Module routes check it with `isCronRequest(req)`.
 *
 * Zero-setup: an explicit CRON_SECRET wins; otherwise it is DERIVED from
 * SUPABASE_SERVICE_ROLE_KEY (HMAC-SHA256 with a fixed context string) — the
 * same pattern as PAYLOAD_SECRET in lib/cms/derived-credentials.ts. The DB
 * bootstrap writes the resolved value into Supabase Vault so Supabase Cron can
 * send it (see lib/db/bootstrap.ts), so nobody has to set it by hand.
 *
 * Rotating the service-role key changes the derived value; the bootstrap
 * re-syncs Vault on the next boot.
 */
const CRON_SECRET_CONTEXT = "dream-starter-kit:cron-secret";

export interface CronSecretSource {
  CRON_SECRET?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export function deriveCronSecret(seed: string): string {
  return createHmac("sha256", seed).update(CRON_SECRET_CONTEXT).digest("hex");
}

export function resolveCronSecret(
  source: CronSecretSource,
): string | undefined {
  if (source.CRON_SECRET) return source.CRON_SECRET;
  if (source.SUPABASE_SERVICE_ROLE_KEY) {
    return deriveCronSecret(source.SUPABASE_SERVICE_ROLE_KEY);
  }
  return undefined;
}

/** True when `authorization` is exactly `Bearer <cron secret>`. */
export function isCronAuthorized(
  authorization: string | null | undefined,
  source: CronSecretSource,
): boolean {
  const secret = resolveCronSecret(source);
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * For module cron routes (`publicRoutes`): true when the request carries the
 * cron bearer secret. Reads CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY from the
 * server environment.
 */
export function isCronRequest(req: Request): boolean {
  return isCronAuthorized(req.headers.get("authorization"), {
    // Server-side module code reads the host's env directly (see MODULES.md).
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
