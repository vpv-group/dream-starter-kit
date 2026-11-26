import { z } from "zod/v4";

/**
 * How the CLI proves who it is to the Dream registry (meetdream.com):
 *
 * - **In module-ops.yml:** the run's GitHub Actions OIDC token, minted for
 *   the registry's origin. The registry checks the signature, the repository
 *   and that it is this repo's own module-ops.yml, then treats it as the
 *   connected site's license key. Nothing secret is stored in the repo.
 * - **On a laptop or in a cloud session:** `DREAM_TOKEN`, your license key
 *   from meetdream.com → Account → Modules (a developer sign-in replaces it
 *   later). It travels only in the `X-Dream-License-Key` header and is never
 *   printed.
 *
 * docs/MODULES.md → Paid modules; meet-dream docs/PAID-MODULES.md → Dream
 * Updates.
 */

export type Env = Record<string, string | undefined>;

export type RegistryAuth =
  { kind: "oidc"; token: string } | { kind: "key"; key: string };

export function authHeaders(auth: RegistryAuth): Record<string, string> {
  return auth.kind === "oidc"
    ? { Authorization: `Bearer ${auth.token}` }
    : { "X-Dream-License-Key": auth.key };
}

/** The OIDC audience the registry expects: its own origin. */
export function registryAudience(registry: string): string {
  return new URL(registry).origin;
}

/** Is this a GitHub Actions job that may mint an OIDC token (`id-token: write`)? */
export function canMintOidc(env: Env): boolean {
  return Boolean(
    env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  );
}

const oidcResponse = z.object({ value: z.string().min(1) });

/** Mint the job's OIDC token for `audience`, or null outside Actions. */
export async function actionsOidcToken(
  audience: string,
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) return null;
  const target = new URL(url);
  target.searchParams.set("audience", audience);
  const res = await fetchImpl(target, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) {
    throw new Error(
      `GitHub didn't issue an OIDC token (HTTP ${res.status}); module-ops.yml needs \`id-token: write\``,
    );
  }
  const parsed = oidcResponse.safeParse(await res.json());
  if (!parsed.success) throw new Error("GitHub returned no OIDC token");
  return parsed.data.value;
}

export function developerToken(env: Env = process.env): string | null {
  const token = env.DREAM_TOKEN?.trim() ?? "";
  return token.length > 0 ? token : null;
}

/**
 * Credentials for `registry`: the Actions OIDC token when this runs in a job
 * that can mint one, otherwise DREAM_TOKEN, otherwise null.
 */
export async function resolveRegistryAuth(
  registry: string,
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<RegistryAuth | null> {
  if (canMintOidc(env)) {
    const token = await actionsOidcToken(
      registryAudience(registry),
      env,
      fetchImpl,
    );
    if (token) return { kind: "oidc", token };
  }
  const key = developerToken(env);
  return key ? { kind: "key", key } : null;
}

export async function requireRegistryAuth(
  registry: string,
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<RegistryAuth> {
  const auth = await resolveRegistryAuth(registry, env, fetchImpl);
  if (!auth) {
    throw new Error(
      "Paid modules need a Dream sign-in: set DREAM_TOKEN to your license " +
        "key from meetdream.com → Account → Modules (docs/MODULES.md → " +
        "Paid modules). In module-ops.yml the run signs in by itself.",
    );
  }
  return auth;
}
