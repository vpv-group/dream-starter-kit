import { describe, expect, it } from "vitest";

import { resolveSmtpConfig } from "./smtp";

describe("resolveSmtpConfig", () => {
  it("is off without SMTP_HOST", () => {
    expect(resolveSmtpConfig({})).toBeNull();
    expect(resolveSmtpConfig({ SMTP_HOST: "  " })).toBeNull();
  });

  it("builds a local Mailpit transport with a default sender", () => {
    expect(
      resolveSmtpConfig({
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "54325",
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
      }),
    ).toMatchObject({
      defaultFromAddress: "no-reply@app.example.com",
      transportOptions: { host: "127.0.0.1", port: 54325, secure: false },
    });
  });

  it("uses implicit TLS on 465 and passes credentials", () => {
    const config = resolveSmtpConfig({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "u",
      SMTP_PASS: "p",
      SMTP_FROM_ADDRESS: "hello@example.com",
      SMTP_FROM_NAME: "Example",
    });
    expect(config).toMatchObject({
      defaultFromAddress: "hello@example.com",
      defaultFromName: "Example",
      transportOptions: { secure: true, auth: { user: "u", pass: "p" } },
    });
  });
});
