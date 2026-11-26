/**
 * Expand/contract rule for database migrations (kit and modules alike).
 *
 * Updates go live one at a time and can be reverted, while migrations are
 * forward-only. That is only safe when every migration keeps the database
 * usable by the code of the PREVIOUS release:
 *
 *   - expand first: add tables, columns (nullable or with a default),
 *     functions, policies;
 *   - contract later, in a separate release once no code uses the old shape:
 *     drop or rename tables and columns, change a column's type, make a
 *     column NOT NULL, truncate.
 *
 * A migration that contracts must say so on purpose with a marker comment,
 * `-- dream:contract <why>`. Automatic update merging treats those as needing
 * review. `pnpm mod remove` writes the marker on its teardown migration.
 */

export interface ContractFinding {
  statement: string;
  message: string;
}

/** The marker that declares an intentional contract step. */
export const CONTRACT_MARKER = /--\s*dream:contract\b/i;

const RULES: [RegExp, string][] = [
  [/\bdrop\s+table\b/i, "drops a table"],
  [/\bdrop\s+schema\b/i, "drops a schema"],
  [/\bdrop\s+column\b/i, "drops a column"],
  [/\brename\s+column\b/i, "renames a column"],
  [/\balter\s+table\b[^;]*?\brename\s+to\b/i, "renames a table"],
  [/\balter\s+column\b[^;]*?\btype\b/i, "changes a column's type"],
  [/\balter\s+column\b[^;]*?\bset\s+not\s+null\b/i, "makes a column NOT NULL"],
  [/\btruncate\b/i, "truncates a table"],
];

/** Remove comments and quoted literals so only real SQL is checked. */
export function stripSqlNoise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, (body) =>
      // Keep function bodies: DDL inside DO blocks still runs.
      body.replace(/'(?:[^']|'')*'/g, "''"),
    )
    .replace(/'(?:[^']|'')*'/g, "''");
}

/** Contract statements in a migration (empty when it only expands). */
export function findContractStatements(sql: string): ContractFinding[] {
  const findings: ContractFinding[] = [];
  for (const raw of stripSqlNoise(sql).split(";")) {
    const statement = raw.replace(/\s+/g, " ").trim();
    if (!statement) continue;
    for (const [re, message] of RULES) {
      if (re.test(statement)) {
        findings.push({ statement: statement.slice(0, 160), message });
        break;
      }
    }
  }
  return findings;
}

export function isMarkedContract(sql: string): boolean {
  return CONTRACT_MARKER.test(sql);
}

/**
 * Lint one migration file: errors when it contracts without the marker.
 * Grandfathered files (shipped before this rule) are skipped by the caller.
 */
export function lintMigrationSafety(file: string, sql: string): string[] {
  if (isMarkedContract(sql)) return [];
  return findContractStatements(sql).map(
    (f) =>
      `${file}: ${f.message} ("${f.statement}"). Keep migrations backward compatible (expand first, contract in a later release), or mark an intentional contract step with "-- dream:contract <why>".`,
  );
}
