"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";

/** A secret shown masked, with Reveal and Copy (admin-only surfaces). */
export function CopySecret({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const masked = `${value.slice(0, 13)}${"•".repeat(12)}`;
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-2">
      <code className="break-all">{shown ? value : masked}</code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setShown((s) => !s)}
      >
        {shown ? "Hide" : "Reveal"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </span>
  );
}
