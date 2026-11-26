"use client";

import { useState } from "react";

import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

async function postForUrl(url: string, body: unknown): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "Request failed");
  return json.url;
}

/**
 * Opens the payment provider's customer portal for an existing subscriber
 * (change plan, update payment method, cancel) — the caller's own, or a
 * workspace's (`orgId`, owners/admins). First-time checkout lives on /pricing.
 */
export function ManageBillingButton({
  variant = "outline",
  label = "Manage billing",
  orgId,
}: {
  variant?: "default" | "outline";
  label?: string;
  orgId?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    try {
      const url = await postForUrl(
        "/api/mod/billing/portal",
        orgId ? { orgId } : {},
      );
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing");
      setLoading(false);
    }
  }

  return (
    <Button
      variant={variant}
      disabled={loading}
      onClick={() => void openPortal()}
    >
      {loading ? "Opening…" : label}
    </Button>
  );
}
