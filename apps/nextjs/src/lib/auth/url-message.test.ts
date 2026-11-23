import { describe, expect, it } from "vitest";

import { parseAuthUrlMessage } from "./url-message";

describe("parseAuthUrlMessage", () => {
  it("reads GoTrue's email-change message once and strips it everywhere", () => {
    const msg =
      "Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email";
    expect(
      parseAuthUrlMessage(`?message=${msg}`, `#message=${msg}&sb=`),
    ).toEqual({
      kind: "success",
      text: "Confirmation link accepted. Open the link we sent to your other email address to finish changing it.",
      search: "",
      hash: "",
    });
  });

  it("shows an unknown message verbatim", () => {
    expect(parseAuthUrlMessage("?message=Hello%20there", "")?.text).toBe(
      "Hello there",
    );
  });

  it("reports an error redirect as an error", () => {
    const result = parseAuthUrlMessage(
      "",
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(result).toEqual({
      kind: "error",
      text: "Email link is invalid or has expired",
      search: "",
      hash: "",
    });
  });

  it("keeps unrelated params and session tokens", () => {
    const result = parseAuthUrlMessage(
      "?next=%2Fprofile&message=Hi",
      "#access_token=abc&refresh_token=def&message=Hi",
    );
    expect(result?.search).toBe("?next=%2Fprofile");
    expect(result?.hash).toBe("#access_token=abc&refresh_token=def");
  });

  it("returns null when there is nothing to show", () => {
    expect(parseAuthUrlMessage("?next=/a", "#access_token=abc")).toBeNull();
    expect(parseAuthUrlMessage("", "")).toBeNull();
  });
});
