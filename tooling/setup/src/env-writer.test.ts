import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildCiEnv,
  buildLocalEnv,
  commentOutEmpty,
  isCiEnv,
  parseSupabaseStatus,
} from "./env-writer";

const STATUS_OUTPUT = `ANON_KEY="anon.jwt"
API_URL="http://127.0.0.1:54321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
S3_PROTOCOL_ACCESS_KEY_ID="s3-id"
S3_PROTOCOL_ACCESS_KEY_SECRET="s3-secret"
SERVICE_ROLE_KEY="service.jwt"
`;
const status = parseSupabaseStatus(STATUS_OUTPUT);

describe("parseSupabaseStatus", () => {
  it('reads KEY="value" lines and ignores the rest', () => {
    expect(
      parseSupabaseStatus('Stopped services: [x]\nANON_KEY="a"\nPLAIN=b\n'),
    ).toEqual({ ANON_KEY: "a", PLAIN: "b" });
  });
});

describe("buildLocalEnv (local + cloud profiles)", () => {
  const example = [
    "# NEXT_PUBLIC_SUPABASE_URL=",
    "# NEXT_PUBLIC_SUPABASE_ANON_KEY=",
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=""',
    'SUPABASE_SERVICE_ROLE_KEY=""',
    'PAYLOAD_SECRET=""',
    'S3_ACCESS_KEY_ID=""',
    'S3_SECRET_ACCESS_KEY=""',
    'CRON_SECRET=""',
    'AI_GATEWAY_API_KEY=""',
    '# STRIPE_WEBHOOK_SECRET=""',
    'STRIPE_SECRET_KEY=""',
    'KEEP_ME="set"',
    "",
  ].join("\n");

  it("fills the local keys and comments out what stays empty", () => {
    expect(buildLocalEnv({ example, status, payloadSecret: "p$1" }))
      .toMatchInlineSnapshot(`
        "NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
        NEXT_PUBLIC_SUPABASE_ANON_KEY="anon.jwt"
        EXPO_PUBLIC_SUPABASE_ANON_KEY="anon.jwt"
        SUPABASE_SERVICE_ROLE_KEY="service.jwt"
        PAYLOAD_SECRET="p$1"
        S3_ACCESS_KEY_ID="s3-id"
        S3_SECRET_ACCESS_KEY="s3-secret"
        CRON_SECRET="local-dev-cron-secret"
        AI_GATEWAY_API_KEY="dummy-local-key-not-real"
        STRIPE_WEBHOOK_SECRET="whsec_e2e_test_secret"
        # STRIPE_SECRET_KEY=""
        KEEP_ME="set"
        "
      `);
  });

  it("produces a schema-safe .env from the real .env.example", () => {
    const real = readFileSync(
      fileURLToPath(new URL("../../../.env.example", import.meta.url)),
      "utf8",
    );
    const out = buildLocalEnv({ example: real, status, payloadSecret: "x" });
    expect(out).not.toMatch(/^[A-Z][A-Z0-9_]*=""$/m);
    for (const line of [
      'NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY="anon.jwt"',
      'SUPABASE_SERVICE_ROLE_KEY="service.jwt"',
      'PAYLOAD_SECRET="x"',
    ]) {
      expect(out.split("\n")).toContain(line);
    }
  });

  it("fails loudly when the stack isn't running", () => {
    expect(() =>
      buildLocalEnv({ example, status: {}, payloadSecret: "x" }),
    ).toThrow(/ANON_KEY/);
  });
});

describe("commentOutEmpty", () => {
  it('only touches KEY="" lines', () => {
    expect(commentOutEmpty('A=""\nB="1"\n# C=""\n')).toBe(
      '# A=""\nB="1"\n# C=""\n',
    );
  });
});

describe("buildCiEnv (ci profile)", () => {
  it("mirrors a fresh hosted project", () => {
    const out = buildCiEnv(status);
    const values = out.split("\n").filter((l) => l && !l.startsWith("#"));
    expect(values).toMatchInlineSnapshot(`
      [
        "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY=anon.jwt",
        "SUPABASE_SERVICE_ROLE_KEY=service.jwt",
        "SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=require",
        "NEXT_PUBLIC_APP_URL=http://localhost:3000",
        "AI_GATEWAY_API_KEY=dummy-ci-key-not-real",
        "EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY=anon.jwt",
        "EXPO_PUBLIC_API_URL=http://localhost:3000",
        "STRIPE_WEBHOOK_SECRET=whsec_e2e_test_secret",
        "NEXT_PUBLIC_CMS_URL=http://localhost:3000",
        "S3_ENDPOINT=http://127.0.0.1:54321/storage/v1/s3",
        "S3_REGION=local",
        "S3_ACCESS_KEY_ID=stub",
        "S3_SECRET_ACCESS_KEY=anon.jwt",
        "S3_BUCKET=cms-media",
        "SMTP_HOST=127.0.0.1",
        "SMTP_PORT=54325",
      ]
    `);
    expect(out).not.toMatch(/^PAYLOAD_(SECRET|DATABASE_URL)=/m);
  });

  it("appends sslmode to a DB URL that already has parameters", () => {
    expect(
      buildCiEnv({ ...status, DB_URL: "postgresql://h/db?x=1" }),
    ).toContain("SUPABASE_DB_URL=postgresql://h/db?x=1&sslmode=require");
  });
});

describe("isCiEnv", () => {
  it("recognizes a ci-profile .env so local and cloud replace it", () => {
    expect(isCiEnv(buildCiEnv(parseSupabaseStatus(STATUS_OUTPUT)))).toBe(true);
    expect(isCiEnv("AI_GATEWAY_API_KEY=dummy-ci-key-not-real\n")).toBe(true);
    expect(isCiEnv("NEXT_PUBLIC_SUPABASE_URL=x\nPAYLOAD_SECRET=y\n")).toBe(
      false,
    );
  });
});
