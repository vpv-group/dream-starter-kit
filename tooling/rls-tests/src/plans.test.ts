/**
 * Query-plan regression: RLS must stay O(rows), not O(rows × subqueries).
 *
 * `supabase db advisors` (pnpm db:advisors, CI) catches unindexed foreign
 * keys and `auth.uid()` that isn't wrapped in a select, but not a
 * security-definer helper called with a ROW column inside a policy
 * (`is_org_member(org_id)`): Postgres can't inline it, so it runs once per
 * row. This suite seeds enough rows for the planner to care, then EXPLAINs the
 * hot queries as a signed-in user and asserts:
 *   - org-scoped policies resolve membership once (an InitPlan), never as a
 *     per-row SubPlan;
 *   - feed / unread / thread queries use the indexes built for them.
 * Everything runs in one transaction that is rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

interface PlanNode {
  "Node Type": string;
  Filter?: string;
  "Recheck Cond"?: string;
  "Index Cond"?: string;
  "Index Name"?: string;
  "Subplan Name"?: string;
  "Parent Relationship"?: string;
  Plans?: PlanNode[];
}

function walk(node: PlanNode, out: PlanNode[] = []): PlanNode[] {
  out.push(node);
  for (const child of node.Plans ?? []) walk(child, out);
  return out;
}

// This suite only ever targets the local stack. The CI profile's .env adds
// `sslmode=require` to SUPABASE_DB_URL to exercise the hosted-TLS path
// elsewhere; node-postgres reads that as verify-full, which the local
// certificate fails (and a local stack may not serve TLS at all). Drop it.
const dbUrl = new URL(DB_URL);
dbUrl.searchParams.delete("sslmode");
const client = new pg.Client({ connectionString: dbUrl.toString() });
let userId = "";
let threadId = "";

async function explain(sql: string): Promise<PlanNode[]> {
  const res = await client.query<{ "QUERY PLAN": { Plan: PlanNode }[] }>(
    `explain (format json) ${sql}`,
  );
  const plan = res.rows[0]?.["QUERY PLAN"][0]?.Plan;
  if (!plan) throw new Error(`no plan for: ${sql}`);
  return walk(plan);
}

/** Per-row subplans (not InitPlans, not hashed one-shot subplans). */
function perRowSubplans(nodes: PlanNode[]): PlanNode[] {
  return nodes.filter(
    (n) =>
      n["Parent Relationship"] === "SubPlan" &&
      !n["Subplan Name"]?.startsWith("hashed"),
  );
}

/** Public security-definer functions (can't be inlined by the planner). */
let definerFunctions: string[] = [];

/**
 * Per-row calls of a public security-definer helper inside a plan condition,
 * e.g. `Filter: is_org_member(org_id)` — the shape that runs once per row.
 */
function perRowDefinerCalls(nodes: PlanNode[]): string[] {
  const found: string[] = [];
  for (const n of nodes) {
    for (const cond of [n.Filter, n["Recheck Cond"], n["Index Cond"]]) {
      if (!cond) continue;
      for (const fn of definerFunctions) {
        if (new RegExp(`\\b${fn}\\(`).test(cond)) found.push(`${fn}: ${cond}`);
      }
    }
  }
  return found;
}

const usesIndex = (nodes: PlanNode[], index: string) =>
  nodes.some((n) => n["Index Name"] === index);

beforeAll(async () => {
  await client.connect();
  const fns = await client.query<{ proname: string }>(
    `select p.proname from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef`,
  );
  definerFunctions = fns.rows.map((r) => r.proname);
  await client.query("begin");
  // 3000 users, each owning a workspace; the subject belongs to 3 of them.
  await client.query(`
    insert into auth.users (id, instance_id, aud, role, email, is_anonymous,
                            raw_user_meta_data, created_at, updated_at)
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'plans' || g || '@test.invalid',
           false, '{}'::jsonb, now(), now()
    from generate_series(1, 3000) g`);
  await client.query(`
    insert into public.organizations (name, slug, owner_id)
    select 'Plans ' || g, 'plans-org-' || g,
           (select id from public.profiles where email = 'plans' || g || '@test.invalid')
    from generate_series(1, 3000) g`);
  const subject = await client.query<{ id: string }>(
    `select id from public.profiles where email = 'plans1@test.invalid'`,
  );
  userId = subject.rows[0]?.id ?? "";
  await client.query(
    `insert into public.memberships (org_id, user_id, role)
     select o.id, $1, 'member' from public.organizations o
     where o.slug in ('plans-org-2', 'plans-org-3')`,
    [userId],
  );
  // Notifications: 30 per user, a third unread.
  await client.query(`
    insert into public.mod_notifications (user_id, type, title, created_at, read_at)
    select p.id, 'plans', 't', now() - (g || ' minutes')::interval,
           case when g % 3 = 0 then null else now() end
    from public.profiles p cross join generate_series(1, 30) g
    where p.email like 'plans%@test.invalid'`);
  // Chat: one thread per user with 20 messages.
  await client.query(`
    insert into public.mod_chat_threads (user_id, title)
    select p.id, 'plans' from public.profiles p where p.email like 'plans%@test.invalid'`);
  await client.query(`
    insert into public.mod_chat_messages (thread_id, role, content, created_at)
    select t.id, 'user', 'hi', now() - (g || ' seconds')::interval
    from public.mod_chat_threads t cross join generate_series(1, 20) g
    where t.title = 'plans'`);
  const thread = await client.query<{ id: string }>(
    `select id from public.mod_chat_threads where user_id = $1 limit 1`,
    [userId],
  );
  threadId = thread.rows[0]?.id ?? "";
  await client.query("analyze");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ role: "authenticated", sub: userId }),
  ]);
  await client.query("set local role authenticated");
});

afterAll(async () => {
  await client.query("rollback").catch(() => undefined);
  await client.end();
});

describe("org-scoped RLS resolves membership once per query", () => {
  it.each([
    ["organizations", "select * from public.organizations"],
    ["memberships", "select * from public.memberships"],
    ["invitations", "select * from public.invitations"],
  ])("%s has no per-row SubPlan or definer call", async (_table, sql) => {
    const nodes = await explain(sql);
    expect(perRowSubplans(nodes)).toEqual([]);
    expect(perRowDefinerCalls(nodes)).toEqual([]);
  });

  it("would catch the old per-row policy shape (self-check)", async () => {
    await client.query("savepoint old_shape");
    await client.query("reset role");
    await client.query(
      `drop policy "memberships: select if member" on public.memberships`,
    );
    await client.query(
      `create policy "memberships: select if member" on public.memberships
       for select to authenticated using (public.is_org_member(org_id))`,
    );
    await client.query("set local role authenticated");
    const nodes = await explain("select * from public.memberships");
    await client.query("rollback to savepoint old_shape");
    expect(perRowDefinerCalls(nodes).length).toBeGreaterThan(0);
  });
});

describe("hot queries use their indexes", () => {
  it("notification feed page", async () => {
    const nodes = await explain(
      `select * from public.mod_notifications where user_id = '${userId}'
       order by created_at desc limit 50`,
    );
    expect(usesIndex(nodes, "mod_notifications_user_created_idx")).toBe(true);
  });

  it("unread count", async () => {
    const nodes = await explain(
      `select count(*) from public.mod_notifications
       where user_id = '${userId}' and read_at is null`,
    );
    expect(usesIndex(nodes, "mod_notifications_unread_idx")).toBe(true);
  });

  it("thread messages in order", async () => {
    const nodes = await explain(
      `select * from public.mod_chat_messages where thread_id = '${threadId}'
       order by created_at`,
    );
    expect(usesIndex(nodes, "mod_chat_messages_thread_created_idx")).toBe(true);
  });
});
