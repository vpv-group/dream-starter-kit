import * as migration_20260612_023534_ext_billing from "./20260612_023534_ext_billing";
import * as migration_20261126_193316_billing_provider_adapters from "./20261126_193316_billing_provider_adapters";

/**
 * Payload (cms-schema) migrations shipped by this module — merged into the
 * host's prodMigrations by the generated payload registry (§3.2). Each was
 * generated with `payload migrate:create` and relocated here; the paired
 * .json snapshots stay in the host's payload/migrations dir for schema-diff
 * continuity.
 *
 * - 20260612_023534_ext_billing renames the billing catalog to the
 *   ext-billing-* slugs (drop + recreate — part of the documented one-time
 *   breaking restructure).
 * - 20261126_193316_billing_provider_adapters adds the billing 2.x settings
 *   (Modules → Billing → Tags, the Stripe adapter's settings tab) and makes
 *   the Subscriptions mirror's Stripe id optional. It first shipped as a core
 *   migration; moving it here keeps its name, so a database that already ran
 *   it never runs it again.
 */
export const migrations = [
  {
    up: migration_20260612_023534_ext_billing.up,
    down: migration_20260612_023534_ext_billing.down,
    name: "20260612_023534_ext_billing",
  },
  {
    up: migration_20261126_193316_billing_provider_adapters.up,
    down: migration_20261126_193316_billing_provider_adapters.down,
    name: "20261126_193316_billing_provider_adapters",
  },
];
