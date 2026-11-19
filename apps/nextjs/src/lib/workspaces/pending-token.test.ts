import { describe, expect, it } from "vitest";

import {
  decodePendingToken,
  encodePendingToken,
  inviteTokenFromRedirect,
} from "./pending-token";

const T = "DU4fe-dCYfsq2MgWyla2ljLOHqg6VNUDizaQNkjkPK8";

describe("pending workspace token", () => {
  it("round-trips invite and join tokens", () => {
    expect(
      decodePendingToken(encodePendingToken({ kind: "invite", value: T })),
    ).toEqual({
      kind: "invite",
      value: T,
    });
    expect(decodePendingToken(`join:${T}`)).toEqual({ kind: "join", value: T });
  });

  it("rejects junk", () => {
    expect(decodePendingToken(undefined)).toBeNull();
    expect(decodePendingToken("invite:short")).toBeNull();
    expect(decodePendingToken(`admin:${T}`)).toBeNull();
    expect(decodePendingToken(`invite:${T}/../x`)).toBeNull();
  });

  it("extracts the token from a same-origin /invite redirect only", () => {
    const origin = "https://app.example.com";
    expect(inviteTokenFromRedirect(`${origin}/invite/${T}`, origin)).toBe(T);
    expect(inviteTokenFromRedirect(`/invite/${T}`, origin)).toBe(T);
    expect(
      inviteTokenFromRedirect(`https://evil.com/invite/${T}`, origin),
    ).toBeNull();
    expect(
      inviteTokenFromRedirect(`${origin}/accept-invite`, origin),
    ).toBeNull();
    expect(inviteTokenFromRedirect(null, origin)).toBeNull();
  });
});
