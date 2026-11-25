import { execFileSync } from "node:child_process";

/**
 * Give the local site a license key (or take it away) for the Updates E2E.
 * A localhost deployment never registers with meetdream.com, so the spec
 * writes the key straight into the CMS global's table, the same row the
 * server reads (lib/dream/site.ts), as local Supabase's superuser (the cms
 * schema belongs to the payload_cms role). Local Postgres only.
 */
const DB_URL = "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres";

export function setSiteKey(key: string | null): void {
  const value = key === null ? "null" : `'${key.replace(/'/g, "''")}'`;
  const prefix = key === null ? "null" : `'${key.slice(0, 12)}'`;
  const sql = `
    insert into cms.dream_site (license_key, license_key_prefix)
    select ${value}, ${prefix}
    where not exists (select 1 from cms.dream_site);
    update cms.dream_site set license_key = ${value}, license_key_prefix = ${prefix};`;
  execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], {
    stdio: "pipe",
  });
}
