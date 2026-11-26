/**
 * SECURITY DEFINER functions in `public` run with their owner's rights and
 * are reachable over the REST API (`/rest/v1/rpc/<fn>`). Each one anon can
 * execute must either check who is calling (auth.uid() / auth.role()) or be
 * on the allowlist below of functions meant for anonymous callers.
 *
 * This caught `mod_billing_purge()` and the module housekeeping functions,
 * which anyone could run over the API. The fix for module functions is a
 * guard in the function (module SQL can't REVOKE) — the kit also revokes API
 * execute on every function it registers for housekeeping.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Deliberately callable without a caller check (token- or slug-based). */
const ANON_ALLOWED = new Set([
  "invitation_preview",
  "join_link_preview",
  "is_slug_available",
]);

// The suite only targets the local stack; see plans.test.ts for why sslmode
// is dropped.
const dbUrl = new URL(DB_URL);
dbUrl.searchParams.delete("sslmode");
const client = new pg.Client({ connectionString: dbUrl.toString() });

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

describe("SECURITY DEFINER functions reachable by anon check their caller", () => {
  it("has no unguarded definer function in public", async () => {
    const { rows } = await client.query<{ name: string; src: string }>(`
      select p.proname as name, p.prosrc as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('anon', p.oid, 'execute')
    `);
    const unguarded = rows
      .filter((r) => !ANON_ALLOWED.has(r.name))
      .filter((r) => !/auth\.(uid|role|jwt)\s*\(/i.test(r.src))
      .map((r) => r.name)
      .sort();
    expect(unguarded).toEqual([]);
  });

  it("revokes API execute on registered housekeeping functions", async () => {
    const { rows } = await client.query<{ fn: string; anon: boolean }>(`
      select h.fn,
             has_function_privilege('anon', to_regprocedure(h.fn || '()'), 'execute') as anon
      from private.housekeeping_tasks h
      where to_regprocedure(h.fn || '()') is not null
    `);
    expect(rows.filter((r) => r.anon)).toEqual([]);
  });
});
