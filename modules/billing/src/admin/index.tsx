"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@acme/ui/alert";

/**
 * Billing's own panel on Modules → Billing (manifest
 * `admin.settingsComponent`; payment providers' panels, e.g. Stripe's
 * connector, render after it). It only speaks up when buyers can't pay:
 * no payment provider installed (a kit update can bring billing without the
 * Stripe adapter, docs/UPDATING.md), or none connected yet. Otherwise it
 * renders nothing — the provider's panel shows the details.
 */

interface ProviderStatus {
  id: string;
  label: string;
  platforms: string[];
  configured: boolean;
}

type Load =
  | { state: "loading" }
  | { state: "ready"; providers: ProviderStatus[] }
  | { state: "error" };

export function AdminSettings() {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mod/billing/admin/providers")
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { providers?: ProviderStatus[] };
        if (!cancelled) {
          setLoad({ state: "ready", providers: json.providers ?? [] });
        }
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.state !== "ready") return null;
  const { providers } = load;

  if (providers.length === 0) {
    return (
      <Alert variant="destructive" data-testid="billing-no-provider">
        <AlertTitle>No payment provider installed</AlertTitle>
        <AlertDescription>
          <p>
            Plans and pricing work, but nobody can pay: checkout and the paywall
            say payments aren’t set up yet. Billing takes payments through a
            payment-provider module. Add the Stripe one with{" "}
            <code>pnpm mod add billing-adapter-stripe</code> (or from Modules →
            Browse), then connect Stripe here.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (!providers.some((p) => p.configured)) {
    return (
      <Alert data-testid="billing-not-connected">
        <AlertTitle>No payment provider is connected yet</AlertTitle>
        <AlertDescription>
          <p>
            {providers.map((p) => p.label).join(", ")}{" "}
            {providers.length === 1 ? "is" : "are"} installed but not set up, so
            checkout and the paywall say payments aren’t set up yet. Connect one
            below.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
