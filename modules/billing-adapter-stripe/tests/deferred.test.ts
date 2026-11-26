/**
 * Deferred Elements options: the wallet button renders before any server
 * round-trip, so today's charge must be computed from the plan alone.
 */
import { describe, expect, it } from "vitest";

import { deferredElementsOptions } from "../src/web/deferred";

describe("deferredElementsOptions", () => {
  it("charges the intro amount today for an intro subscription", () => {
    expect(
      deferredElementsOptions({
        id: 1,
        pricingType: "recurring",
        unitAmount: 999,
        currency: "usd",
        introOffer: { enabled: true, introAmount: 199 },
      }),
    ).toEqual({
      mode: "subscription",
      amount: 199,
      currency: "usd",
    });
  });

  it("charges the unit price for a plain recurring plan", () => {
    expect(
      deferredElementsOptions({
        id: 1,
        pricingType: "recurring",
        unitAmount: 9900,
        currency: "usd",
      }),
    ).toEqual({ mode: "subscription", amount: 9900, currency: "usd" });
  });

  it("uses setup mode for a $0-today free trial", () => {
    const opts = deferredElementsOptions({
      id: 1,
      pricingType: "recurring",
      unitAmount: 999,
      currency: "usd",
      trialDays: 7,
    });
    expect(opts).toEqual({ mode: "setup", currency: "usd" });
  });

  it("charges the unit price for a one-time plan", () => {
    expect(
      deferredElementsOptions({
        id: 1,
        pricingType: "one_time",
        unitAmount: 4900,
        currency: "usd",
      }),
    ).toEqual({ mode: "payment", amount: 4900, currency: "usd" });
  });

  it("returns null when the plan isn't loaded yet", () => {
    expect(deferredElementsOptions(null)).toBeNull();
  });
});
