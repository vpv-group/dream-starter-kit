import { z } from "zod/v4";

/**
 * Dream Updates client (docs/MODULES.md → Automatic updates). Pure: no env,
 * no Payload, injected fetch, so it is unit tested directly
 * (updates-core.test.ts). `updates.ts` wires it to the app.
 *
 * The site authenticates with its own site license key (the `dream-site`
 * global) — never sent to the browser. meetdream.com answers:
 *
 * - `GET  /sites/updates`       connection, the owner's settings, holds
 * - `PUT  /sites/settings`      save the owner's settings
 * - `POST /sites/github-token`  a one-hour token for the connected repo that
 *                               can start module-ops.yml and read PRs, but
 *                               can't change code
 * - `POST /connect/github/start` the "Dream Updates" App install URL
 */

export const updateSettingsSchema = z.object({
  autoUpdate: z.boolean().default(true),
  autoMerge: z.boolean().default(true),
  paused: z.array(z.string()).default([]),
  skipped: z.array(z.string()).default([]),
  /** Set by Meet Dream after a failed deploy; cleared by `resume: true`. */
  pausedReason: z.string().nullable().default(null),
});
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;
export const DEFAULT_UPDATE_SETTINGS: UpdateSettings =
  updateSettingsSchema.parse({});

const updatesSchema = z.object({
  connections: z.object({
    source: z
      .object({ provider: z.string(), repo: z.string().nullable() })
      .nullable(),
  }),
  settings: updateSettingsSchema,
  hold: z.string().nullable().default(null),
  brokerConfigured: z.boolean().default(true),
});

export interface UpdatesState {
  status: "ok";
  connected: boolean;
  repo: string | null;
  settings: UpdateSettings;
  /** Meet Dream's global hold on automatic merging, if any. */
  hold: string | null;
  /** Is the Dream Updates App set up on meetdream.com at all? */
  brokerConfigured: boolean;
}

/** Why the registry couldn't answer, as a calm state for the UI. */
export interface UpdatesProblem {
  status: "no-site-key" | "unreachable" | "refused";
  code?: string;
  message: string;
}

export interface SiteToken {
  token: string;
  expiresAt: string;
  repo: string;
}

interface CallOpts {
  registry: string;
  siteKey: string;
  fetchImpl?: typeof fetch;
}

async function call(
  opts: CallOpts,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: true; body: unknown } | UpdatesProblem> {
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(
      `${opts.registry.replace(/\/$/, "")}${path}`,
      {
        method: init.method ?? "GET",
        headers: {
          "X-Dream-License-Key": opts.siteKey,
          ...(init.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (err) {
    return {
      status: "unreachable",
      message: `Meet Dream is unreachable (${(err as Error).message}).`,
    };
  }
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { code, message } = body as { code?: string; message?: string };
    return {
      status: "refused",
      ...(code ? { code } : {}),
      message: message ?? code ?? `HTTP ${res.status}`,
    };
  }
  return { ok: true, body };
}

export async function fetchUpdates(
  opts: CallOpts,
): Promise<UpdatesState | UpdatesProblem> {
  const res = await call(opts, "/sites/updates");
  if (!("ok" in res)) return res;
  const parsed = updatesSchema.safeParse(res.body);
  if (!parsed.success) {
    return { status: "refused", message: "Unexpected answer from Meet Dream." };
  }
  const source = parsed.data.connections.source;
  return {
    status: "ok",
    connected: Boolean(source?.repo),
    repo: source?.repo ?? null,
    settings: parsed.data.settings,
    hold: parsed.data.hold,
    brokerConfigured: parsed.data.brokerConfigured,
  };
}

export async function saveSettings(
  opts: CallOpts,
  settings: Omit<UpdateSettings, "pausedReason"> & { resume?: boolean },
): Promise<{ status: "ok"; settings: UpdateSettings } | UpdatesProblem> {
  const res = await call(opts, "/sites/settings", {
    method: "PUT",
    body: settings,
  });
  if (!("ok" in res)) return res;
  const parsed = z
    .object({ settings: updateSettingsSchema })
    .safeParse(res.body);
  return parsed.success
    ? { status: "ok", settings: parsed.data.settings }
    : { status: "refused", message: "Unexpected answer from Meet Dream." };
}

export async function fetchSiteToken(
  opts: CallOpts,
): Promise<{ status: "ok"; token: SiteToken } | UpdatesProblem> {
  const res = await call(opts, "/sites/github-token", { method: "POST" });
  if (!("ok" in res)) return res;
  const parsed = z
    .object({
      token: z.string().min(1),
      expiresAt: z.string(),
      repo: z.string(),
    })
    .safeParse(res.body);
  return parsed.success
    ? { status: "ok", token: parsed.data }
    : { status: "refused", message: "Unexpected answer from Meet Dream." };
}

export async function connectGithubUrl(
  opts: CallOpts,
  returnTo: string,
): Promise<{ status: "ok"; url: string } | UpdatesProblem> {
  const res = await call(opts, "/connect/github/start", {
    method: "POST",
    body: { returnTo },
  });
  if (!("ok" in res)) return res;
  const parsed = z.object({ url: z.url() }).safeParse(res.body);
  return parsed.success
    ? { status: "ok", url: parsed.data.url }
    : { status: "refused", message: "Unexpected answer from Meet Dream." };
}

/**
 * One cached token per process, refreshed 5 minutes before it expires
 * (GitHub installation tokens last an hour).
 */
export function tokenCache(now: () => number = Date.now) {
  let cached: SiteToken | null = null;
  return {
    get(): SiteToken | null {
      if (!cached) return null;
      return Date.parse(cached.expiresAt) - now() > 5 * 60_000 ? cached : null;
    },
    set(token: SiteToken) {
      cached = token;
    },
    clear() {
      cached = null;
    },
  };
}
