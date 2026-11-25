import { z } from "zod/v4";

import type { Env } from "../registry-auth";
import { actionsOidcToken, registryAudience } from "../registry-auth";

/**
 * `pnpm mod ops session` — module-ops.yml's sign-in (docs/MODULES.md →
 * Automatic updates). The job's GitHub Actions OIDC token goes to the Dream
 * registry's `POST /ops/session`, which checks it is this repository's own
 * module-ops.yml and answers with a one-hour token for this repository plus
 * the owner's update settings and Meet Dream's holds. No secret is stored in
 * the repository.
 */

const settingsSchema = z.object({
  autoUpdate: z.boolean().default(true),
  autoMerge: z.boolean().default(true),
  paused: z.array(z.string()).default([]),
  skipped: z.array(z.string()).default([]),
  pausedReason: z.string().nullable().default(null),
});

const sessionSchema = z.object({
  githubToken: z.string().min(1),
  expiresAt: z.string().optional(),
  repo: z.string(),
  settings: settingsSchema,
  hold: z.string().nullable().default(null),
  releaseHolds: z
    .array(z.object({ target: z.string(), version: z.string() }))
    .default([]),
  site: z.object({ canary: z.boolean().default(false) }).default({
    canary: false,
  }),
});

export type OpsSession = z.infer<typeof sessionSchema>;
export type SessionSettings = z.infer<typeof settingsSchema>;

export type SessionResult =
  | { status: "ok"; session: OpsSession }
  | {
      status: "not-connected" | "unavailable";
      message: string;
    };

const NOT_CONNECTED_CODES = new Set([
  "not_connected",
  "site_inactive",
  "broker_not_configured",
]);

export async function openSession(
  registry: string,
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionResult> {
  const oidc = await actionsOidcToken(
    registryAudience(registry),
    env,
    fetchImpl,
  );
  if (!oidc) {
    return {
      status: "unavailable",
      message:
        "No GitHub Actions OIDC token: module-ops.yml needs `id-token: write`.",
    };
  }
  let res: Response;
  try {
    res = await fetchImpl(`${registry.replace(/\/$/, "")}/ops/session`, {
      method: "POST",
      headers: { Authorization: `Bearer ${oidc}` },
    });
  } catch (err) {
    return {
      status: "unavailable",
      message: `Meet Dream is unreachable (${(err as Error).message}); nothing runs until it answers.`,
    };
  }
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { code, message } = body as { code?: string; message?: string };
    const text = message ?? code ?? `HTTP ${res.status}`;
    if (code && NOT_CONNECTED_CODES.has(code)) {
      return {
        status: "not-connected",
        message: `${text}. Connect GitHub in /admin → Updates to turn on automatic updates.`,
      };
    }
    return { status: "unavailable", message: `Meet Dream refused: ${text}` };
  }
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: "unavailable",
      message: "Meet Dream sent an unexpected session.",
    };
  }
  return { status: "ok", session: parsed.data };
}

/**
 * Lines for $GITHUB_OUTPUT. The token is masked first (printed to the log
 * as `::add-mask::`), so it never shows in later output. Job outputs can't
 * carry it to other jobs: every job opens its own session.
 */
export function sessionOutputs(result: SessionResult): {
  log: string;
  output: string;
} {
  if (result.status !== "ok") {
    return {
      log: `::notice title=Automatic updates are off::${result.message}\n`,
      output: `connected=false\nreason=${oneLine(result.message)}\n`,
    };
  }
  const { session } = result;
  const lines = [
    "connected=true",
    `token=${session.githubToken}`,
    `repo=${session.repo}`,
    `auto_update=${String(session.settings.autoUpdate)}`,
    `auto_merge=${String(session.settings.autoMerge && !session.settings.pausedReason)}`,
    `paused=${session.settings.paused.join(",")}`,
    `hold=${oneLine(session.hold ?? "")}`,
  ];
  return {
    log: `::add-mask::${session.githubToken}\n`,
    output: `${lines.join("\n")}\n`,
  };
}

function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}
