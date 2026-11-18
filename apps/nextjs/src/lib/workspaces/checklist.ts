import type { AuthSettings } from "@acme/app";
import { labelLower } from "@acme/app";

import type { ChecklistItem } from "~/components/onboarding/setup-checklist";
import type { WorkspaceMember } from "~/lib/workspaces/server";
import { stepsForMember } from "~/lib/workspaces/server";

/**
 * Checklist rows for /a: "Create your workspace" (done) plus every onboarding
 * task step this member has, done or not. Preference steps (updates) aren't
 * tasks, so they stay off the list. Unfinished rows come first; the first one
 * reads "Needs you".
 */
export function buildChecklist(
  settings: AuthSettings,
  member: WorkspaceMember,
): ChecklistItem[] {
  const steps = stepsForMember(settings, member).filter(
    (s) => s.key !== "updates",
  );
  const rows: ChecklistItem[] = [];
  if (member.isCreator) {
    rows.push({
      key: "workspace",
      number: 1,
      title: `Create your ${labelLower(settings.workspaceLabel)}`,
      status: "done",
    });
  }
  for (const step of steps) {
    const isDone = member.onboardingDone.includes(step.key);
    rows.push({
      key: step.key,
      number: rows.length + 1,
      title: step.title,
      status: isDone ? "done" : "skipped",
      description: isDone ? undefined : "You skipped this. About a minute.",
      href: isDone ? undefined : step.path,
    });
  }
  const open = rows.filter((r) => r.status !== "done");
  const first = open[0];
  if (first) first.status = "current";
  return [...open, ...rows.filter((r) => r.status === "done")];
}
