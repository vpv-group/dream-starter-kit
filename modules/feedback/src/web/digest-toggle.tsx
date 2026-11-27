"use client";

import { toast } from "sonner";

import { Label } from "@acme/ui/label";
import { Switch } from "@acme/ui/switch";

import { useSetStaffPrefs, useStaffPrefs } from "../hooks/use-feedback";

/** "Email me the digest" — each staff member's own opt-out. */
export function DigestToggle() {
  const prefs = useStaffPrefs();
  const set = useSetStaffPrefs();
  if (!prefs.data || prefs.data.cadence === "never") return null;
  return (
    <div className="flex items-center gap-2 pr-1">
      <Switch
        id="feedback-digest"
        checked={prefs.data.digest}
        disabled={set.isPending}
        onCheckedChange={(digest) =>
          set.mutate(
            { digest },
            {
              onSuccess: () =>
                toast.success(
                  digest ? "You'll get the digest" : "Digest turned off",
                ),
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
      <Label htmlFor="feedback-digest" className="text-sm font-normal">
        Email me the {prefs.data.cadence} digest
      </Label>
    </div>
  );
}
