import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Local dev admin: a pre-confirmed staff account so `/admin` and `/a` work
 * right after `pnpm dev:setup`, with no sign-up and no Mailpit round-trip.
 *
 * Created through the LOCAL Supabase admin API with the local stack's
 * well-known service-role key (tooling only — never app or client code). On a
 * freshly reset database it is the first non-anonymous profile, so the
 * existing "first user becomes staff" trigger makes it the founder/admin; on a
 * database that already has users it is flagged staff explicitly.
 *
 * Credentials are written to `.dream/dev-admin.json` (gitignored) so tools
 * (and people) can sign in; re-runs reuse them.
 */

export const DEV_ADMIN_EMAIL = "admin@dream.test";

export interface DevAdminCredentials {
  email: string;
  password: string;
}

interface Deps {
  apiUrl: string;
  serviceRoleKey: string;
  root: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

function credentialsPath(root: string) {
  return path.join(root, ".dream", "dev-admin.json");
}

export function readDevAdmin(root: string): DevAdminCredentials | null {
  const file = credentialsPath(root);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(
      readFileSync(file, "utf8"),
    ) as DevAdminCredentials;
    return parsed.email && parsed.password ? parsed : null;
  } catch {
    return null;
  }
}

export async function ensureDevAdmin(deps: Deps): Promise<DevAdminCredentials> {
  const f = deps.fetchImpl ?? fetch;
  const log = deps.log ?? console.log;
  const creds = readDevAdmin(deps.root) ?? {
    email: DEV_ADMIN_EMAIL,
    password: randomBytes(12).toString("base64url"),
  };
  const headers = {
    apikey: deps.serviceRoleKey,
    Authorization: `Bearer ${deps.serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const created = await f(`${deps.apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
      email_confirm: true,
    }),
  });

  let userId: string | undefined;
  if (created.ok) {
    userId = ((await created.json()) as { id?: string }).id;
  } else if (created.status === 422) {
    // Already registered: find it and reset the password to the stored one.
    const list = await f(`${deps.apiUrl}/auth/v1/admin/users?per_page=1000`, {
      headers,
    });
    const body = (await list.json()) as {
      users?: { id: string; email?: string }[];
    };
    userId = body.users?.find((u) => u.email === creds.email)?.id;
    if (!userId) throw new Error(`Couldn't find ${creds.email} to update it.`);
    const updated = await f(`${deps.apiUrl}/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ password: creds.password, email_confirm: true }),
    });
    if (!updated.ok) {
      throw new Error(
        `Updating the dev admin failed (HTTP ${updated.status}).`,
      );
    }
  } else {
    throw new Error(
      `Creating the dev admin failed (HTTP ${created.status}): ${await created.text()}`,
    );
  }

  // Staff even when other users already existed (first user = staff only on a
  // fresh database).
  const staff = await f(
    `${deps.apiUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId ?? "")}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ is_staff: true }),
    },
  );
  if (!staff.ok) {
    log(
      `[dev:setup] warning: couldn't flag ${creds.email} as staff (HTTP ${staff.status})`,
    );
  }

  const file = credentialsPath(deps.root);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
  return creds;
}
