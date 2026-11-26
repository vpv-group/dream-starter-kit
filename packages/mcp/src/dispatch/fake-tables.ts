/**
 * Test helper: a tiny in-memory stand-in for the slice of supabase-js's
 * query builder the dispatch code uses (`from().select/upsert/delete` with
 * `in` / `lt` / `lte` filters, `order`, `limit`). Not exported from the
 * package; only the dispatch unit tests import it.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface FakeTables {
  tables: Record<string, Row[]>;
  /** Fail every operation on these tables with this message. */
  failOn: Record<string, string>;
  from: (table: string) => unknown;
}

export function makeFakeTables(
  initial: Record<string, Row[]> = {},
): FakeTables {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(initial)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }
  const failOn: Record<string, string> = {};

  function from(table: string) {
    const rowsOf = () => (tables[table] ??= []);
    const filters: Filter[] = [];
    let op: "select" | "delete" | "upsert" = "select";
    let upsertRows: Row[] = [];
    let orderBy: { col: string; asc: boolean } | undefined;
    let limit: number | undefined;

    function run() {
      const failure = failOn[table];
      if (failure) {
        return { data: null, error: { message: failure }, count: null };
      }
      const matches = (row: Row) => filters.every((f) => f(row));
      if (op === "upsert") {
        for (const row of upsertRows) {
          if (!rowsOf().some((r) => r.id === row.id)) rowsOf().push({ ...row });
        }
        return { data: null, error: null, count: null };
      }
      if (op === "delete") {
        const before = rowsOf();
        const kept = before.filter((r) => !matches(r));
        tables[table] = kept;
        return {
          data: null,
          error: null,
          count: before.length - kept.length,
        };
      }
      let data = rowsOf().filter(matches);
      if (orderBy) {
        const { col, asc } = orderBy;
        data = [...data].sort((a, b) => {
          const x = String(a[col]);
          const y = String(b[col]);
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      if (limit !== undefined) data = data.slice(0, limit);
      return { data: data.map((r) => ({ ...r })), error: null, count: null };
    }

    const builder = {
      select() {
        op = "select";
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      upsert(rows: Row | Row[]) {
        op = "upsert";
        upsertRows = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      in(col: string, values: unknown[]) {
        filters.push((r) => values.includes(r[col]));
        return builder;
      },
      lt(col: string, value: string) {
        filters.push((r) => String(r[col]) < value);
        return builder;
      },
      lte(col: string, value: string) {
        filters.push((r) => String(r[col]) <= value);
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderBy = { col, asc: opts?.ascending ?? true };
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      then<T>(
        resolve: (value: ReturnType<typeof run>) => T,
        reject?: (reason: unknown) => T,
      ) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };
    return builder;
  }

  return { tables, failOn, from };
}
