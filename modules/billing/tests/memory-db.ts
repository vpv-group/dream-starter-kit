/**
 * A small in-memory stand-in for the service-role client with real reads:
 * rows live in per-table arrays, and select/upsert/update/delete honour the
 * eq / neq / in filters billing's core uses. Enough to run the billing-tag
 * reconcile and the ledger end to end without a database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export function memoryDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) {
    tables[t] = rows.map((r) => ({ ...r }));
  }
  const rowsOf = (t: string) => (tables[t] ??= []);
  const rpcCalls: { fn: string; args: Row }[] = [];

  function from(table: string) {
    const filters: Filter[] = [];
    let mode: "select" | "update" | "delete" | "upsert" = "select";
    let values: Row | Row[] | undefined;
    let onConflict: string[] = [];
    let ignoreDuplicates = false;
    let returning = false;

    const run = () => {
      const all = rowsOf(table);
      if (mode === "select") {
        return all.filter((r) => filters.every((f) => f(r)));
      }
      if (mode === "update") {
        const hit = all.filter((r) => filters.every((f) => f(r)));
        for (const r of hit) Object.assign(r, values);
        return hit;
      }
      if (mode === "delete") {
        tables[table] = all.filter((r) => !filters.every((f) => f(r)));
        return [];
      }
      const list = Array.isArray(values) ? values : [values ?? {}];
      const out: Row[] = [];
      for (const v of list) {
        const keys = onConflict.length > 0 ? onConflict : ["id"];
        const existing = all.find((r) => keys.every((k) => r[k] === v[k]));
        if (existing) {
          if (!ignoreDuplicates) Object.assign(existing, v);
          out.push(existing);
        } else {
          const row = { id: uuid(), ...v };
          all.push(row);
          out.push(row);
        }
      }
      return out;
    };

    const result = () => ({ data: run(), error: null });
    const query = {
      select: () => {
        if (mode !== "select") returning = true;
        return query;
      },
      upsert: (
        v: Row | Row[],
        opts: { onConflict?: string; ignoreDuplicates?: boolean } = {},
      ) => {
        mode = "upsert";
        values = v;
        onConflict = opts.onConflict?.split(",") ?? [];
        ignoreDuplicates = opts.ignoreDuplicates ?? false;
        return query;
      },
      update: (v: Row) => {
        mode = "update";
        values = v;
        return query;
      },
      delete: () => {
        mode = "delete";
        return query;
      },
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v);
        return query;
      },
      neq: (c: string, v: unknown) => {
        filters.push((r) => r[c] !== v);
        return query;
      },
      in: (c: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[c]));
        return query;
      },
      order: () => query,
      limit: () => query,
      range: (a: number, b: number) => {
        const base = run;
        return {
          then: <T>(resolve: (r: { data: Row[]; error: null }) => T) =>
            Promise.resolve({ data: base().slice(a, b + 1), error: null }).then(
              resolve,
            ),
        };
      },
      maybeSingle: () => {
        const rows = run();
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then: <T>(resolve: (r: { data: Row[] | null; error: null }) => T) => {
        const r = result();
        return Promise.resolve(
          mode === "select" || returning ? r : { data: null, error: null },
        ).then(resolve);
      },
    };
    return query;
  }

  const client = {
    from,
    rpc: (fn: string, args: Row = {}) => {
      rpcCalls.push({ fn, args });
      if (fn === "mod_billing_apply_subscription") {
        const row = args._row as Row;
        const subs = rowsOf("mod_billing_subscriptions");
        const existing = subs.find((s) => s.id === row.id);
        if (existing) Object.assign(existing, row);
        else subs.push({ ...row });
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  return {
    admin: client as unknown as SupabaseClient<Database>,
    tables,
    rpcCalls,
    /** The tag names linked to a user. */
    tagsOf(userId: string): string[] {
      const ids = new Set(
        rowsOf("user_tags")
          .filter((l) => l.user_id === userId)
          .map((l) => l.tag_id),
      );
      return rowsOf("tags")
        .filter((t) => ids.has(t.id))
        .map((t) => t.name as string)
        .sort();
    },
  };
}
