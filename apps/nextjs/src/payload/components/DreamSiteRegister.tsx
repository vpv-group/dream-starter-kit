"use client";

import { useState } from "react";
import { useFormFields } from "@payloadcms/ui";

/**
 * Top of System → Site License: a "Generate license key" button while this
 * deployment has no site key — e.g. it was set up before site licenses
 * existed, or the automatic registration failed. Calls the admin-only
 * /api/cms/dream-site/register, then reloads so the global shows the key.
 * Renders nothing once a key exists.
 */
export function DreamSiteRegister() {
  const hasKey = useFormFields(([fields]) => {
    const value = fields.licenseKey?.value;
    return typeof value === "string" && value.length > 0;
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (hasKey) return null;

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cms/dream-site/register", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMessage("License key generated. Loading it…");
        window.location.reload();
        return;
      }
      setMessage(data.error ?? `Failed (HTTP ${res.status}).`);
    } catch {
      setMessage("Failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: "1.5rem" }}>
      <p style={{ marginBottom: "0.75rem", opacity: 0.8 }}>
        This site has no license key yet. Generate one now to register this
        domain with meetdream.com.
      </p>
      <button
        type="button"
        className="btn btn--style-primary btn--size-medium"
        style={{ margin: 0 }}
        disabled={busy}
        onClick={() => void generate()}
      >
        <span className="btn__content">
          <span className="btn__label">
            {busy ? "Generating…" : "Generate license key"}
          </span>
        </span>
      </button>
      {message ? (
        <p
          role="status"
          style={{ fontSize: "0.85rem", opacity: 0.85, marginTop: "0.5rem" }}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
