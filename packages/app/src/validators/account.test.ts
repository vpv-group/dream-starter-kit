import { describe, expect, it } from "vitest";

import { accountErrorMessage, isReauthenticationNeeded } from "../auth";
import {
  changeEmailSchema,
  makeChangePasswordSchema,
  phoneSchema,
  reauthCodeSchema,
  updateProfileSchema,
} from "./auth";

describe("account-settings validators", () => {
  it("accepts common phone formats and an empty value", () => {
    for (const ok of [
      "+1 (555) 010-0199",
      "+447700900123",
      "555.010.0199",
      "",
    ]) {
      expect(phoneSchema.safeParse(ok).success, ok).toBe(true);
    }
  });

  it("rejects junk phone numbers", () => {
    for (const bad of [
      "abc",
      "12",
      "+1 555 CALL NOW",
      "--------",
      "1".repeat(25),
    ]) {
      expect(phoneSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("extends the profile schema with optional title + phone", () => {
    expect(
      updateProfileSchema.safeParse({
        displayName: "Ada",
        title: "Engineer",
        phone: "+1 555 010 0199",
      }).success,
    ).toBe(true);
    expect(
      updateProfileSchema.safeParse({ displayName: "Ada", phone: "nope" })
        .success,
    ).toBe(false);
    expect(
      updateProfileSchema.safeParse({
        displayName: "Ada",
        title: "x".repeat(81),
      }).success,
    ).toBe(false);
  });

  it("validates the new email", () => {
    expect(changeEmailSchema.safeParse({ email: "a@b.com" }).success).toBe(
      true,
    );
    expect(changeEmailSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("enforces the configured minimum length and matching confirmation", () => {
    const schema = makeChangePasswordSchema(10);
    expect(
      schema.safeParse({
        password: "0123456789",
        confirmPassword: "0123456789",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ password: "short", confirmPassword: "short" }).success,
    ).toBe(false);
    const mismatch = schema.safeParse({
      password: "0123456789",
      confirmPassword: "0123456780",
    });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("accepts only a 6-digit reauthentication code", () => {
    expect(reauthCodeSchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(reauthCodeSchema.safeParse({ code: "12345" }).success).toBe(false);
    expect(reauthCodeSchema.safeParse({ code: "abcdef" }).success).toBe(false);
  });
});

describe("account-settings error helpers", () => {
  it("detects GoTrue's reauthentication_needed error", () => {
    expect(isReauthenticationNeeded({ code: "reauthentication_needed" })).toBe(
      true,
    );
    expect(isReauthenticationNeeded({ code: "same_password" })).toBe(false);
    expect(isReauthenticationNeeded(new Error("x"))).toBe(false);
    expect(isReauthenticationNeeded(null)).toBe(false);
  });

  it("maps known error codes to friendly messages", () => {
    expect(accountErrorMessage({ code: "email_exists" }, "f")).toMatch(
      /already in use/,
    );
    expect(accountErrorMessage(new Error("boom"), "f")).toBe("boom");
    expect(accountErrorMessage("??", "fallback")).toBe("fallback");
  });
});
