/**
 * Direct DB-state assertions for specs that need to verify what a UI flow
 * actually persisted (e.g. founder.setup.ts asserting sign-up created the
 * auth user + profile). Uses the SERVICE ROLE key from `.env` — fine here
 * because this is server-side test tooling, the same trust level as
 * tooling/rls-tests (golden rule #2: the key never ships in app/client code).
 */
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

interface AdminUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  is_staff: boolean;
  email: string | null;
  phone: string | null;
  title: string | null;
}

interface ContentFavoriteRow {
  user_id: string;
  collection: string;
  item_id: string;
}

function serviceHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing from .env — required for DB-state " +
        "assertions. Locally `supabase status` prints it; CI provisions it.",
    );
  }
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/** Look up the auth.users row for `email` via GoTrue's admin API. */
export async function fetchAuthUserByEmail(
  email: string,
): Promise<AdminUser | undefined> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: serviceHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GoTrue admin user list failed: ${res.status}`);
  }
  const { users } = (await res.json()) as { users: AdminUser[] };
  return users.find((u) => u.email === email);
}

/** Read a public.profiles row by user id (PostgREST, service role). */
export async function fetchProfile(
  id: string,
): Promise<ProfileRow | undefined> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}&select=id,display_name,is_staff,email,phone,title`,
    { headers: serviceHeaders() },
  );
  if (!res.ok) {
    throw new Error(`profiles read failed: ${res.status}`);
  }
  const rows = (await res.json()) as ProfileRow[];
  return rows[0];
}

/** Fetch an auth.users row by id (incl. `is_anonymous`) via GoTrue admin. */
export async function fetchAuthUser(
  id: string,
): Promise<AdminUser | undefined> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    headers: serviceHeaders(),
  });
  if (!res.ok) return undefined;
  return (await res.json()) as AdminUser;
}

/** Read public.content_favorites rows matching a PostgREST query string. */
export async function fetchContentFavorites(
  query: string,
): Promise<ContentFavoriteRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/content_favorites?${query}`,
    { headers: serviceHeaders() },
  );
  if (!res.ok) throw new Error(`content_favorites read failed: ${res.status}`);
  return (await res.json()) as ContentFavoriteRow[];
}

/**
 * Webhook-style write of an active subscription for `userId` (the Stripe edge
 * webhook is the only writer in production; here we mimic it so specs can assert
 * the premium-gating outcome without depending on local webhook delivery).
 */
export async function grantActiveSubscription(userId: string): Promise<void> {
  const headers = {
    ...serviceHeaders(),
    "content-type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
  await fetch(`${SUPABASE_URL}/rest/v1/mod_billing_products`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "prod_e2e_paywall", name: "E2E Paywall" }),
  });
  await fetch(`${SUPABASE_URL}/rest/v1/mod_billing_prices`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "price_e2e_paywall",
      product_id: "prod_e2e_paywall",
      active: true,
      unit_amount: 3999,
      currency: "usd",
      type: "recurring",
      interval: "month",
    }),
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/mod_billing_subscriptions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: `sub_e2e_paywall_${userId}`,
      user_id: userId,
      price_id: "price_e2e_paywall",
      status: "active",
    }),
  });
  if (!res.ok) {
    throw new Error(`grantActiveSubscription failed: ${res.status}`);
  }
}

/** The names of the tags linked to a user (service role, like the admin UI). */
export async function fetchUserTagNames(userId: string): Promise<string[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_tags?user_id=eq.${userId}&select=tags(name)`,
    { headers: serviceHeaders() },
  );
  if (!res.ok) throw new Error(`fetchUserTagNames failed: ${res.status}`);
  const rows = (await res.json()) as { tags: { name: string } | null }[];
  return rows.flatMap((r) => (r.tags ? [r.tags.name] : [])).sort();
}

/**
 * A confirmed email+password user, created through GoTrue's admin API (no
 * Mailpit round-trip) — for specs that need extra accounts, e.g. workspace
 * members. Returns the auth user id.
 */
export async function createConfirmedUser(
  email: string,
  password: string,
  displayName: string,
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...serviceHeaders(), "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    }),
  });
  if (!res.ok) throw new Error(`createConfirmedUser failed: ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

/** Delete an auth user (its profile, memberships and purchases cascade). */
export async function deleteAuthUser(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: serviceHeaders(),
  });
}

/**
 * A workspace owned by `ownerId`, with `members` as [userId, role] pairs
 * (the owner included). Service-role writes, like the RLS suite's fixtures.
 */
export async function createWorkspace(
  name: string,
  slug: string,
  ownerId: string,
  members: [string, "owner" | "admin" | "member"][],
): Promise<string> {
  const headers = {
    ...serviceHeaders(),
    "content-type": "application/json",
    Prefer: "return=representation",
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/organizations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, slug, owner_id: ownerId }),
  });
  if (!res.ok) throw new Error(`createWorkspace failed: ${res.status}`);
  const [org] = (await res.json()) as { id: string }[];
  if (!org) throw new Error("createWorkspace returned no row");
  const ms = await fetch(`${SUPABASE_URL}/rest/v1/memberships`, {
    method: "POST",
    headers,
    body: JSON.stringify(
      members.map(([user_id, role]) => ({ org_id: org.id, user_id, role })),
    ),
  });
  if (!ms.ok) throw new Error(`memberships insert failed: ${ms.status}`);
  return org.id;
}

/** Delete a workspace (memberships and its purchases cascade). */
export async function deleteWorkspace(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${id}`, {
    method: "DELETE",
    headers: serviceHeaders(),
  });
}
