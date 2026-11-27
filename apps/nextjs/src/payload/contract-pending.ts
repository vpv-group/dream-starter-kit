import type { PostgresAdapterArgs } from "@payloadcms/db-postgres";
import type { AnyPgColumn } from "@payloadcms/db-postgres/drizzle/pg-core";
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgSchema,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "@payloadcms/db-postgres/drizzle/pg-core";

/**
 * `cms` tables kept for one release after their collection was removed
 * (expand/contract: the previous release may still read them if an update is
 * reverted). No collection defines them any more, so Payload's dev push
 * (`push: true` outside production) would drop them on every first boot —
 * and drizzle-kit drops the table with CASCADE before the FK it also plans to
 * drop, so that boot failed ("constraint … does not exist"): `pnpm cms:seed`
 * exited 1 after `pnpm db:reset`, and a rerun "worked" on the half-pushed
 * schema with the table gone.
 *
 * Declaring each table here exactly as its migration created it (columns,
 * enum, indexes, FKs) gives push nothing to diff. Only for dev push: the
 * Payload migrate commands (`PAYLOAD_MIGRATING`, which `migrate:create` sets
 * too) must see the real collection schema, or the next generated migration
 * would re-create the table. Remove a table in the release whose
 * `dream:contract` migration drops it.
 *
 * - `device_tokens` (+ `enum_device_tokens_platform`): the device-tokens
 *   collection, removed after 2.4 — push tokens live in the notifications
 *   module's RLS table. Created by 20260610_212512_full_registry.
 */
export const keepContractPendingTables: NonNullable<
  PostgresAdapterArgs["beforeSchemaInit"]
>[number] = ({ schema }) => {
  // Raw env on purpose: NODE_ENV is Node's own, and PAYLOAD_MIGRATING is set
  // by Payload's migrate CLI itself — neither is deployment config for the
  // zod schema or turbo's env list.
  // eslint-disable-next-line no-restricted-properties
  const production = process.env.NODE_ENV === "production";
  // eslint-disable-next-line no-restricted-properties, turbo/no-undeclared-env-vars
  const migrating = process.env.PAYLOAD_MIGRATING === "true";
  if (production || migrating) return schema;
  const cms = pgSchema("cms");
  const platforms: [string, ...string[]] = ["ios", "android", "web"];
  const platform = cms.enum("enum_device_tokens_platform", platforms);
  const users = schema.tables.users as
    { id: AnyPgColumn<{ tableName: "users" }> } | undefined;
  const deviceTokens = cms.table(
    "device_tokens",
    {
      id: serial("id").primaryKey(),
      user_id: integer("user_id").notNull(),
      token: varchar("token").notNull(),
      platform: platform("platform").notNull(),
      device_model: varchar("device_model"),
      app_version: varchar("app_version"),
      os_version: varchar("os_version"),
      locale: varchar("locale"),
      push_enabled: boolean("push_enabled").default(true),
      last_seen_at: timestamp("last_seen_at", {
        precision: 3,
        withTimezone: true,
        mode: "string",
      }),
      updated_at: timestamp("updated_at", {
        precision: 3,
        withTimezone: true,
        mode: "string",
      })
        .defaultNow()
        .notNull(),
      created_at: timestamp("created_at", {
        precision: 3,
        withTimezone: true,
        mode: "string",
      })
        .defaultNow()
        .notNull(),
    },
    (t) => [
      index("device_tokens_user_idx").on(t.user_id),
      uniqueIndex("device_tokens_token_idx").on(t.token),
      index("device_tokens_updated_at_idx").on(t.updated_at),
      index("device_tokens_created_at_idx").on(t.created_at),
      ...(users
        ? [
            foreignKey({
              name: "device_tokens_user_id_users_id_fk",
              columns: [t.user_id],
              foreignColumns: [users.id],
            }).onDelete("set null"),
          ]
        : []),
    ],
  );
  return {
    ...schema,
    enums: { ...schema.enums, enum_device_tokens_platform: platform },
    tables: { ...schema.tables, device_tokens: deviceTokens },
  };
};
