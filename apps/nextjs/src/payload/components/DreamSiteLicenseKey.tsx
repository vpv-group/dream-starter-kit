"use client";

import { useFormFields } from "@payloadcms/ui";

import { CopySecret } from "./CopySecret";

/**
 * The `licenseKey` field on System → Site License: the full site key,
 * masked, with Reveal and Copy — this global is the only place the full key
 * exists (meetdream.com stores just a hash and shows the prefix). Copy it
 * into the DREAM_LICENSE_KEY repository secret for module ops.
 */
export function DreamSiteLicenseKey() {
  const value = useFormFields(([fields]) => {
    const v = fields.licenseKey?.value;
    return typeof v === "string" ? v : "";
  });

  return (
    <div className="field-type text" style={{ marginBottom: "1.5rem" }}>
      <label className="field-label">License key</label>
      {value ? (
        <CopySecret value={value} />
      ) : (
        <p style={{ opacity: 0.7 }}>No key yet.</p>
      )}
      <div className="field-description">
        Add it as the GitHub repository secret DREAM_LICENSE_KEY so module ops
        can install modules. Keep it secret.
      </div>
    </div>
  );
}
