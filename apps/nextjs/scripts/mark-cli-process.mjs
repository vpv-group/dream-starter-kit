/**
 * Marks this Node process as a CMS CLI script (`pnpm cms:seed`,
 * `pnpm cms:backfill-users`) so payload.config.ts sizes the Postgres pool for
 * a one-shot local process instead of a serverless instance. Loaded with
 * `--import` because the scripts import the config statically — the marker
 * must exist before the config module is evaluated. See
 * src/lib/cms/pool-sizing.ts.
 */
process.env.CMS_CLI_PROCESS = "true";
