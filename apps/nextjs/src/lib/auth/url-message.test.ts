import { describe, expect, it } from "vitest";

import { NOTICES, parseAuthUrlMessage } from "./url-message";

const FIRST_LINK =
  "Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email";

describe("parseAuthUrlMessage", () => {
  it("reads GoTrue's email-change message once and strips it everywhere", () => {
    expect(
      parseAuthUrlMessage(
        `?message=${FIRST_LINK}`,
        `#message=${FIRST_LINK}&sb=`,
      ),
    ).toEqual({
      toast: {
        kind: "success",
        text: "Confirmation link accepted. Open the link we sent to your other email address to finish changing it.",
      },
      search: "",
      hash: "",
    });
  });

  it("shows the kit's email-changed notice and keeps the PKCE code", () => {
    expect(parseAuthUrlMessage("?notice=email-changed&code=abc", "")).toEqual({
      toast: { kind: "success", text: NOTICES["email-changed"] },
      search: "?code=abc",
      hash: "",
    });
  });

  it("reports a GoTrue error with our copy, and it beats a notice", () => {
    const result = parseAuthUrlMessage(
      "?notice=email-changed",
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(result).toEqual({
      toast: {
        kind: "error",
        text: "That email link is invalid or has expired. Request a new one.",
      },
      search: "",
      hash: "",
    });
  });

  it("never renders attacker-supplied text", () => {
    const unknownMessage = parseAuthUrlMessage("?message=Call+us+at+555", "");
    expect(unknownMessage).toEqual({ toast: null, search: "", hash: "" });

    const unknownNotice = parseAuthUrlMessage("?notice=toString", "");
    expect(unknownNotice?.toast).toBeNull();

    const injectedError = parseAuthUrlMessage(
      "",
      "#error_code=evil&error_description=Call+us+at+555",
    );
    expect(injectedError?.toast).toEqual({
      kind: "error",
      text: "That link didn’t work. Please try again.",
    });
    expect(JSON.stringify(injectedError)).not.toContain("555");
  });

  it("leaves the app's own ?error= alone (sign-in, invites)", () => {
    expect(parseAuthUrlMessage("?error=auth_callback", "")).toBeNull();
  });

  it("keeps unrelated params and session tokens", () => {
    const result = parseAuthUrlMessage(
      "?next=%2Fprofile&notice=email-changed",
      "#access_token=abc&refresh_token=def&sb=",
    );
    expect(result?.search).toBe("?next=%2Fprofile");
    expect(result?.hash).toBe("#access_token=abc&refresh_token=def");
  });

  it("returns null when there is nothing to show", () => {
    expect(parseAuthUrlMessage("?next=/a", "#access_token=abc")).toBeNull();
    expect(parseAuthUrlMessage("", "")).toBeNull();
  });
});
