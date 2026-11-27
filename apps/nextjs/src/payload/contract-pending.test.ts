/* eslint-disable no-restricted-properties, turbo/no-undeclared-env-vars -- the hook reads raw process.env (Payload's own PAYLOAD_MIGRATING) */
import {
  getTableConfig,
  pgTable,
  serial,
} from "@payloadcms/db-postgres/drizzle/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { keepContractPendingTables } from "./contract-pending";

type HookArgs = Parameters<typeof keepContractPendingTables>[0];

const users = pgTable("users", { id: serial("id").primaryKey() });
const args = () =>
  ({
    schema: { enums: {}, relations: {}, tables: { users } },
  }) as unknown as HookArgs;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("keepContractPendingTables", () => {
  it("declares device_tokens exactly as its migration created it (dev push)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYLOAD_MIGRATING", "");
    const schema = await keepContractPendingTables(args());
    const table = schema.tables.device_tokens;
    expect(table).toBeDefined();
    const config = getTableConfig(table as never);
    expect(config.schema).toBe("cms");
    expect(config.columns.map((c) => c.name)).toContain("platform");
    expect(config.indexes.map((i) => i.config.name).sort()).toEqual([
      "device_tokens_created_at_idx",
      "device_tokens_token_idx",
      "device_tokens_updated_at_idx",
      "device_tokens_user_idx",
    ]);
    expect(config.foreignKeys.map((f) => f.getName())).toEqual([
      "device_tokens_user_id_users_id_fk",
    ]);
    expect(schema.enums.enum_device_tokens_platform).toBeDefined();
    // The collection schema itself is untouched.
    expect(schema.tables.users).toBe(users);
  });

  it("leaves the schema alone for the migrate commands and production", async () => {
    vi.stubEnv("PAYLOAD_MIGRATING", "true");
    const input = args();
    expect(await keepContractPendingTables(input)).toBe(input.schema);
    vi.stubEnv("PAYLOAD_MIGRATING", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(await keepContractPendingTables(input)).toBe(input.schema);
  });
});
