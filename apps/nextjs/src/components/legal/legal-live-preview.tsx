"use client";

import { useLivePreview } from "@payloadcms/live-preview-react";

import type { Legal } from "@acme/cms";

import { LegalDoc } from "~/components/legal/legal-doc";
import { env } from "~/env";

/**
 * Client wrapper used only inside the Payload admin's Live Preview iframe (when
 * Next.js draft mode is on). Subscribes to the editor's live edits via
 * `useLivePreview` and re-renders the document in place — no save or refresh
 * needed. Mirrors PostLivePreview (see it for the serverURL rationale).
 */
export function LegalLivePreview({ initialData }: { initialData: Legal }) {
  const serverURL =
    typeof window !== "undefined"
      ? window.location.origin
      : env.NEXT_PUBLIC_APP_URL;
  const { data } = useLivePreview<Legal>({ initialData, serverURL, depth: 1 });
  return <LegalDoc doc={data} />;
}
