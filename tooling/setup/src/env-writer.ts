/**
 * Builds the root `.env` for each `pnpm dev:setup` profile. Pure (no I/O) so
 * the exact output is pinned by snapshot tests (env-writer.test.ts) — this
 * one module replaces the copies that used to live in the SessionStart hook
 * and in ci.yml's `integration` job.
 *
 *   - local / cloud: `.env.example` with the local Supabase keys, a generated
 *     PAYLOAD_SECRET and the throwaway test values filled in; every var still
 *     empty is commented out (empty strings fail the zod schema's min(1)).
 *   - ci: a minimal file that mirrors a FRESH hosted project — no
 *     PAYLOAD_SECRET / PAYLOAD_DATABASE_URL (derived from the service-role
 *     key by lib/cms/derived-credentials.ts) and `sslmode=require` on the DB
 *     URL (the TLS step makes the local Postgres speak TLS like hosted).
 */

export type Profile = "local" | "cloud" | "ci";

/** Parsed `supabase status -o env` (KEY="value" lines). */
export type SupabaseStatus = Record<string, string>;

export function parseSupabaseStatus(output: string): SupabaseStatus {
  const out: SupabaseStatus = {};
  for (const line of output.split("\n")) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m?.[1]) continue;
    let value = m[2] ?? "";
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

function need(status: SupabaseStatus, key: string): string {
  const value = status[key];
  if (!value) {
    throw new Error(
      `supabase status did not report ${key} — is the local stack running? (supabase start)`,
    );
  }
  return value;
}

/** Comment out every `KEY=""` line: unset optional vars must be absent. */
export function commentOutEmpty(text: string): string {
  return text.replace(/^([A-Z][A-Z0-9_]*)=""$/gm, '# $1=""');
}

/**
 * local/cloud: fill `.env.example`. Same replacements the SessionStart hook
 * made with sed (one per matching line, first match on each line).
 */
export function buildLocalEnv(input: {
  example: string;
  status: SupabaseStatus;
  payloadSecret: string;
}): string {
  const anon = need(input.status, "ANON_KEY");
  const serviceRole = need(input.status, "SERVICE_ROLE_KEY");
  const s3Id = input.status.S3_PROTOCOL_ACCESS_KEY_ID ?? "";
  const s3Secret = input.status.S3_PROTOCOL_ACCESS_KEY_SECRET ?? "";
  const rules: [RegExp, string][] = [
    [
      /^# NEXT_PUBLIC_SUPABASE_URL=.*$/gm,
      'NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"',
    ],
    [
      /^# NEXT_PUBLIC_SUPABASE_ANON_KEY=.*$/gm,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY="${anon}"`,
    ],
    [
      /^EXPO_PUBLIC_SUPABASE_ANON_KEY=.*$/gm,
      `EXPO_PUBLIC_SUPABASE_ANON_KEY="${anon}"`,
    ],
    [
      /^SUPABASE_SERVICE_ROLE_KEY=.*$/gm,
      `SUPABASE_SERVICE_ROLE_KEY="${serviceRole}"`,
    ],
    [/^PAYLOAD_SECRET=.*$/gm, `PAYLOAD_SECRET="${input.payloadSecret}"`],
    [/^S3_ACCESS_KEY_ID=.*$/gm, `S3_ACCESS_KEY_ID="${s3Id}"`],
    [/^S3_SECRET_ACCESS_KEY=.*$/gm, `S3_SECRET_ACCESS_KEY="${s3Secret}"`],
    [/^CRON_SECRET=.*$/gm, 'CRON_SECRET="local-dev-cron-secret"'],
    [
      /^AI_GATEWAY_API_KEY=.*$/gm,
      'AI_GATEWAY_API_KEY="dummy-local-key-not-real"',
    ],
    [
      /^#? ?STRIPE_WEBHOOK_SECRET=.*$/gm,
      'STRIPE_WEBHOOK_SECRET="whsec_e2e_test_secret"',
    ],
  ];
  let text = input.example;
  // Replacement strings are passed as functions so `$` in a key is literal.
  for (const [pattern, line] of rules) text = text.replace(pattern, () => line);
  return commentOutEmpty(text);
}

/** ci: the minimal fresh-hosted-project env (was a heredoc in ci.yml). */
/** First line of a ci-profile .env, so other profiles know to replace it. */
export const CI_ENV_MARKER =
  "# Written by `pnpm dev:setup --profile ci` (TLS + derived CMS credentials).";

/**
 * Was this .env written for CI? It asks Postgres for TLS and omits
 * PAYLOAD_SECRET, which breaks a local or cloud stack, so those profiles
 * replace it. (Older ci files have no marker; their dummy AI key gives them
 * away.)
 */
export function isCiEnv(text: string): boolean {
  return (
    text.includes(CI_ENV_MARKER) ||
    text.includes("AI_GATEWAY_API_KEY=dummy-ci-key-not-real")
  );
}

export function buildCiEnv(status: SupabaseStatus): string {
  const apiUrl = need(status, "API_URL");
  const anon = need(status, "ANON_KEY");
  const serviceRole = need(status, "SERVICE_ROLE_KEY");
  const dbUrl =
    status.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  // sslmode=require exercises the hosted-TLS path (handle existing params).
  const sslDbUrl = `${dbUrl}${dbUrl.includes("?") ? "&" : "?"}sslmode=require`;
  return [
    CI_ENV_MARKER,
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRole}`,
    `SUPABASE_DB_URL=${sslDbUrl}`,
    "NEXT_PUBLIC_APP_URL=http://localhost:3000",
    '# Dummy key so the AI chat route gets past its "AI not configured" 503',
    "# guard to the auth check (enforcement.spec.ts asserts unauth → 401).",
    "# Never used to call the gateway: the e2e request is unauthenticated.",
    "AI_GATEWAY_API_KEY=dummy-ci-key-not-real",
    `EXPO_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `EXPO_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
    "EXPO_PUBLIC_API_URL=http://localhost:3000",
    "# PAYLOAD_SECRET / PAYLOAD_DATABASE_URL are deliberately ABSENT:",
    "# CI exercises the zero-touch path a clone-and-connect Vercel deploy",
    "# takes — both are derived from SUPABASE_SERVICE_ROLE_KEY (+ the",
    "# admin DB URL) by lib/cms/derived-credentials.ts, and the runtime",
    "# bootstrap creates the payload_cms role with the derived password.",
    "# Throwaway signing secret for the billing Stripe webhook so",
    "# subscription.spec.ts can exercise it with self-signed events",
    "# (no Stripe account involved; never used against the Stripe API).",
    "STRIPE_WEBHOOK_SECRET=whsec_e2e_test_secret",
    "NEXT_PUBLIC_CMS_URL=http://localhost:3000",
    `S3_ENDPOINT=${apiUrl}/storage/v1/s3`,
    "S3_REGION=local",
    "S3_ACCESS_KEY_ID=stub",
    `S3_SECRET_ACCESS_KEY=${anon}`,
    "S3_BUCKET=cms-media",
    "# The app's own emails (e.g. the phone-changed notice) go to Mailpit's",
    "# SMTP port (supabase/config.toml [inbucket] smtp_port); profile.spec.ts",
    "# reads them back like the auth emails.",
    "SMTP_HOST=127.0.0.1",
    "SMTP_PORT=54325",
    "",
  ].join("\n");
}
