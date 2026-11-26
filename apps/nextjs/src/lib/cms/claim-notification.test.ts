import type { SQL } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";
import { PgDialect } from "@payloadcms/db-postgres/drizzle/pg-core";
import { describe, expect, it } from "vitest";

import { claimScheduledNotification } from "./claim-notification";

/**
 * The claim is one conditional UPDATE: these render the statement it sends
 * (no database) and check that it also takes over stale `sending` rows.
 */
function fakePayload(rows: unknown[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const dialect = new PgDialect();
  const payload = {
    db: {
      drizzle: {
        execute: (query: SQL) => {
          queries.push(dialect.sqlToQuery(query));
          return Promise.resolve({ rows });
        },
      },
    },
  } as unknown as Payload;
  return { payload, queries };
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

describe("claimScheduledNotification", () => {
  it("claims scheduled rows and stale sending rows in one statement", async () => {
    const { payload, queries } = fakePayload([{ id: 7 }]);
    await expect(claimScheduledNotification(payload, 7)).resolves.toBe(true);

    expect(queries).toHaveLength(1);
    const q = flat(queries[0]?.sql ?? "");
    expect(q).toContain(`set "status" = 'sending', "updated_at" = now()`);
    expect(q).toContain(`"status" = 'scheduled'`);
    expect(q).toContain(
      `("status" = 'sending' and "updated_at" < now() - interval '10 minutes')`,
    );
    expect(queries[0]?.params).toEqual([7]);
  });

  it("reports a lost race when no row was updated", async () => {
    const { payload } = fakePayload([]);
    await expect(claimScheduledNotification(payload, 8)).resolves.toBe(false);
  });
});
