/**
 * A tiny in-memory stand-in for the service-role Supabase client: it records
 * every table write and RPC call the Stripe adapter (through billing's core
 * services) makes, and answers
 * with canned results. Only the query-builder surface the code uses exists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";

export interface TableOp {
  table: string;
  op: "select" | "upsert" | "update" | "delete";
  values?: unknown;
  filters: [string, unknown][];
}

export interface RpcCall {
  fn: string;
  args: Record<string, unknown> | undefined;
}

interface Result {
  data: unknown;
  error: { message: string } | null;
}

export interface FakeAdminOptions {
  /** RPC name → result (a function gets the args). Unlisted RPCs → null. */
  rpc?: Record<string, Result | ((args: Record<string, unknown>) => Result)>;
  /** Writes to these tables throw (a processing failure). */
  throwOnWrite?: string[];
  /** auth.admin.getUserById → this email (null: the lookup errors). */
  accountEmail?: string | null;
}

export function fakeAdmin(opts: FakeAdminOptions = {}) {
  const ops: TableOp[] = [];
  const rpcCalls: RpcCall[] = [];
  const metadataUpdates: { id: string; attrs: unknown }[] = [];

  function from(table: string) {
    const op: TableOp = { table, op: "select", filters: [] };
    const ok: Result = { data: null, error: null };
    const write = (kind: TableOp["op"], values?: unknown) => {
      if (opts.throwOnWrite?.includes(table)) {
        throw new Error(`write to ${table} failed`);
      }
      op.op = kind;
      op.values = values;
      ops.push(op);
      return query;
    };
    const query = {
      select: () => query,
      upsert: (values: unknown) => write("upsert", values),
      update: (values: unknown) => write("update", values),
      delete: () => write("delete"),
      eq: (column: string, value: unknown) => {
        op.filters.push([column, value]);
        return query;
      },
      neq: (column: string, value: unknown) => {
        op.filters.push([`${column}!`, value]);
        return query;
      },
      in: (column: string, values: unknown) => {
        op.filters.push([`${column}[]`, values]);
        return query;
      },
      order: () => query,
      range: () => query,
      limit: () => query,
      maybeSingle: () => Promise.resolve(ok),
      // Awaiting the builder itself (no .single()) resolves like supabase-js.
      then: <T>(resolve: (r: Result) => T) => Promise.resolve(ok).then(resolve),
    };
    return query;
  }

  const client = {
    from,
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      const canned = opts.rpc?.[fn];
      const result =
        typeof canned === "function"
          ? canned(args ?? {})
          : (canned ?? { data: null, error: null });
      return Promise.resolve(result);
    },
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve(
            opts.accountEmail === null
              ? { data: { user: null }, error: { message: "not found" } }
              : {
                  data: { user: { id, email: opts.accountEmail } },
                  error: null,
                },
          ),
        updateUserById: (id: string, attrs: unknown) => {
          metadataUpdates.push({ id, attrs });
          return Promise.resolve({ data: { user: { id } }, error: null });
        },
      },
    },
  };

  return {
    admin: client as unknown as SupabaseClient<Database>,
    ops,
    rpcCalls,
    metadataUpdates,
  };
}
