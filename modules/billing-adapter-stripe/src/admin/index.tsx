"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@acme/ui/alert";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";

/**
 * The Stripe connector panel on Modules → Billing (manifest
 * `admin.settingsComponent`, rendered on billing's page because this module
 * is a billing adapter). Three parts:
 *
 * - Connection — "Connect with Stripe": Meet Dream is a Stripe Connect
 *   platform; connecting creates this business's own Stripe account
 *   (Stripe-hosted onboarding) and Meet Dream makes the Stripe calls for it.
 *   Or your own keys in env, which win (the way to use an existing account).
 * - Webhook — the one endpoint the hourly check registers (through the Stripe
 *   API, or with Meet Dream, which forwards the account's events), its Vault
 *   secret, and the last event received.
 * - Catalog — billing plans/coupons pushed to Stripe on save.
 *
 * Every action goes through admin-only routes (src/server/index.ts); no
 * secret reaches the browser. Checkout options are the "Stripe" tab above.
 */

const API = "/api/mod/billing-adapter-stripe/admin";

interface SyncCounts {
  synced: number;
  error: number;
  unsynced: number;
}

interface Status {
  enabled: boolean;
  connection:
    | {
        source: "env" | "meetdream";
        accountId: string | null;
        accountName: string | null;
        livemode: boolean | null;
        publishableKey: boolean;
        ready?: boolean;
        onboardingUrl?: string | null;
      }
    | { source: "none"; message: string | null };
  envKeys: boolean;
  canConnect: boolean;
  webhook: {
    expectedUrl: string | null;
    endpoint: { url: string; status: string } | null;
    secretStored: boolean;
    envSecret: boolean;
    lastEvent: { type: string; receivedAt: string } | null;
  };
  catalog: { plans: SyncCounts; coupons: SyncCounts };
  apiError: string | null;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined && path === "/status" ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(
      json.error ?? json.message ?? `Request failed (${res.status})`,
    );
  }
  return json;
}

function mode(livemode: boolean | null) {
  if (livemode === null) return null;
  return (
    <Badge variant={livemode ? "default" : "secondary"}>
      {livemode ? "Live mode" : "Test mode"}
    </Badge>
  );
}

function when(iso: string) {
  return new Date(iso).toLocaleString();
}

export function AdminSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  // Back from Stripe's consent screen (?stripe=connected / ?stripe_error=…).
  const [returned] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search),
  );
  const [error, setError] = useState<string | null>(() => {
    const reason = returned?.get("stripe_error");
    return reason ? `Stripe didn't connect: ${reason}` : null;
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(() =>
    returned?.get("stripe") === "connected"
      ? "Stripe is connected. The webhook registers within the hour (or now, below)."
      : null,
  );

  const load = useCallback(async () => {
    try {
      setStatus(await call<Status>("/status"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Initial load (the promise callbacks set state, not the effect body).
  useEffect(() => {
    let cancelled = false;
    call<Status>("/status")
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(label: string, fn: () => Promise<string | null>) {
    setBusy(label);
    setNote(null);
    setError(null);
    try {
      const message = await fn();
      if (message) setNote(message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const connect = (m: "test" | "live") =>
    run("connect", async () => {
      // Come back to this exact page.
      const returnTo = `${window.location.pathname}?stripe=connected`;
      const { url } = await call<{ url: string }>("/connect", {
        mode: m,
        returnTo,
      });
      window.location.assign(url);
      return null;
    });

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stripe</CardTitle>
          <CardDescription>
            {error ?? "Loading the Stripe connection…"}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const c = status.connection;
  const connected = c.source !== "none";
  const onboarding = c.source === "meetdream" && c.ready === false;
  const w = status.webhook;
  const plans = status.catalog.plans;
  const coupons = status.catalog.coupons;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Stripe
            {connected ? (
              <Badge variant={onboarding ? "outline" : "default"}>
                {c.source === "env"
                  ? "Own API keys"
                  : onboarding
                    ? "Onboarding"
                    : "Connected"}
              </Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
            {connected && mode(c.livemode)}
            {!status.enabled && <Badge variant="outline">Switched off</Badge>}
          </CardTitle>
          <CardDescription>
            Takes web payments for billing: checkout, the customer portal,
            invoices and the plan catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {note && (
            <Alert>
              <AlertDescription>{note}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {c.source === "env" && (
            <p className="text-muted-foreground text-sm">
              Using <code>STRIPE_SECRET_KEY</code> from the environment
              {c.publishableKey
                ? ""
                : " (set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY too, for on-site checkout)"}
              . Your own keys take priority over a Meet Dream connection.
            </p>
          )}
          {c.source === "meetdream" && (
            <p className="text-sm">
              Connected via Meet Dream to{" "}
              <strong>{c.accountName ?? c.accountId}</strong>
              {c.accountName && c.accountId ? ` (${c.accountId})` : ""}.
              Payments go straight to this Stripe account.
            </p>
          )}
          {onboarding && (
            <Alert>
              <AlertTitle>Finish setting up Stripe</AlertTitle>
              <AlertDescription>
                Stripe needs a few more details before this account can take
                payments. Until then checkout says payments aren’t set up yet.
              </AlertDescription>
            </Alert>
          )}
          {c.source === "none" && (
            <p className="text-muted-foreground text-sm">
              Connect with Stripe to start selling — no keys to copy. Stripe
              walks you through setting up the account payments go to. To use a
              Stripe account you already have, set{" "}
              <code>STRIPE_SECRET_KEY</code> and{" "}
              <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in the environment
              instead.
              {c.message ? ` (${c.message})` : ""}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {onboarding && c.source === "meetdream" && c.onboardingUrl && (
              <Button asChild>
                <a href={c.onboardingUrl}>Finish Stripe onboarding</a>
              </Button>
            )}
            {c.source === "meetdream" && !onboarding && (
              <Button asChild variant="outline">
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Stripe Dashboard
                </a>
              </Button>
            )}
            {status.canConnect && c.source === "none" && (
              <>
                <Button
                  disabled={busy !== null}
                  onClick={() => void connect("live")}
                >
                  Connect with Stripe
                </Button>
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void connect("test")}
                >
                  Connect in test mode
                </Button>
              </>
            )}
            {connected && (
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  void run("test", async () => {
                    await call("/test", {});
                    return "Stripe answered — the connection works.";
                  })
                }
              >
                {busy === "test" ? "Testing…" : "Test connection"}
              </Button>
            )}
            {c.source === "meetdream" && (
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  void run("disconnect", async () => {
                    await call("/disconnect", {});
                    return "Disconnected from Stripe.";
                  })
                }
              >
                Disconnect
              </Button>
            )}
          </div>
          {!status.canConnect && c.source === "none" && (
            <p className="text-muted-foreground text-xs">
              Connect with Stripe needs this site's free Meet Dream license
              (registered after the first setup on a public domain; not
              available with DREAM_TELEMETRY=off).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Webhook
            {w.endpoint ? (
              <Badge
                variant={
                  w.endpoint.status === "enabled" ? "default" : "outline"
                }
              >
                {w.endpoint.status === "enabled"
                  ? "Registered"
                  : w.endpoint.status}
              </Badge>
            ) : w.envSecret ? (
              <Badge variant="secondary">Managed by you</Badge>
            ) : (
              <Badge variant="outline">Not registered</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Stripe tells the app about purchases, renewals and cancellations
            here. It's registered automatically every hour once Stripe is
            connected and the site has a public https address.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {w.expectedUrl && (
            <p>
              Endpoint: <code className="break-all">{w.expectedUrl}</code>
            </p>
          )}
          <p className="text-muted-foreground">
            Signing secret:{" "}
            {w.envSecret
              ? "STRIPE_WEBHOOK_SECRET (env)"
              : w.secretStored
                ? "stored in Supabase Vault"
                : "not stored yet"}
            {" · "}
            Last event:{" "}
            {w.lastEvent
              ? `${w.lastEvent.type}, ${when(w.lastEvent.receivedAt)}`
              : "none yet"}
          </p>
          {status.apiError && (
            <p className="text-destructive">Stripe API: {status.apiError}</p>
          )}
          {connected && (
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  void run("webhook", async () => {
                    const r = await call<{
                      status: string;
                      reason?: string;
                      message?: string;
                    }>("/webhook", {});
                    if (r.status === "skipped") {
                      return r.reason === "not_public"
                        ? "Skipped: the site needs a public https address (use `stripe listen` locally)."
                        : "Skipped: Stripe isn't connected.";
                    }
                    if (r.status === "error") throw new Error(r.message);
                    return "Webhook registered.";
                  })
                }
              >
                {busy === "webhook" ? "Registering…" : "Register now"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
          <CardDescription>
            Billing plans and coupons are pushed to Stripe when you save them
            (Commerce → Billing Plans / Coupons; their Stripe tab shows the
            ids).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            Plans: {plans.synced} synced
            {plans.error > 0 ? `, ${plans.error} failed` : ""}
            {plans.unsynced > 0 ? `, ${plans.unsynced} not synced yet` : ""}
            {" · "}
            Coupons: {coupons.synced} synced
            {coupons.error > 0 ? `, ${coupons.error} failed` : ""}
            {coupons.unsynced > 0 ? `, ${coupons.unsynced} not synced yet` : ""}
          </p>
          {connected && (
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null || !status.enabled}
                onClick={() =>
                  void run("resync", async () => {
                    const r = await call<{ plans: number; coupons: number }>(
                      "/resync",
                      {},
                    );
                    return `Pushed ${r.plans} plans and ${r.coupons} coupons to Stripe.`;
                  })
                }
              >
                {busy === "resync" ? "Syncing…" : "Sync everything now"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
