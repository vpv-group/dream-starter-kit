"use client";

import { useState } from "react";

/** cms.users doc id from /admin/collections/users/<id>. */
function docIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const m = /\/admin\/collections\/users\/([^/?#]+)/.exec(
    window.location.pathname,
  );
  const id = m?.[1];
  return id && id !== "create" ? id : null;
}

/** Mirrors Payload's own text inputs (theme tokens) so the panel fits the form. */
const inputStyle = {
  width: "100%",
  marginBottom: "0.5rem",
  height: "calc(var(--base) * 2)",
  padding: "0 calc(var(--base) * 0.75)",
  background: "var(--theme-input-bg)",
  color: "var(--theme-elevation-800)",
  border: "1px solid var(--theme-elevation-150)",
  borderRadius: "var(--style-radius-s)",
  fontSize: "1rem",
  boxShadow: "0 2px 2px -1px #0000001a",
} as const;

/**
 * Sidebar "Password" panel on the Users edit view (admins only — the field's
 * `condition` hides it from editors). Sets the member's Supabase password via
 * /api/cms/user-password; the value is never saved to the CMS document, so it
 * lives outside the form (plain local state, not a Payload field).
 */
export function UserPasswordField() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  async function save() {
    const docId = docIdFromUrl();
    if (!docId) {
      setMessage({ ok: false, text: "Save the user first." });
      return;
    }
    if (!password) {
      setMessage({ ok: false, text: "Enter a new password." });
      return;
    }
    if (password !== confirm) {
      setMessage({ ok: false, text: "Passwords don't match." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cms/user-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setPassword("");
        setConfirm("");
        setMessage({ ok: true, text: "Password updated." });
      } else {
        setMessage({ ok: false, text: data.error ?? "Failed." });
      }
    } catch {
      setMessage({ ok: false, text: "Failed — check your connection." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: "1.5rem" }}>
      <label className="field-label" htmlFor="user-new-password">
        Password
      </label>
      <p style={{ fontSize: "0.8rem", opacity: 0.7, margin: "0 0 0.5rem" }}>
        Set a new sign-in password for this user. It takes effect immediately
        and isn&apos;t stored in the CMS.
      </p>
      <input
        id="user-new-password"
        type="password"
        autoComplete="new-password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={inputStyle}
      />
      <input
        id="user-confirm-password"
        type="password"
        autoComplete="new-password"
        placeholder="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        style={inputStyle}
      />
      <button
        type="button"
        className="btn btn--style-secondary btn--size-small"
        disabled={busy}
        onClick={() => void save()}
      >
        <span className="btn__content">
          <span className="btn__label">
            {busy ? "Saving…" : "Set password"}
          </span>
        </span>
      </button>
      {message ? (
        <p
          role="status"
          style={{
            fontSize: "0.8rem",
            marginTop: "0.4rem",
            color: message.ok ? undefined : "var(--theme-error-500)",
            opacity: message.ok ? 0.8 : 1,
          }}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
