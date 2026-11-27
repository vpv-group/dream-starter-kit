import { redirect } from "next/navigation";
import { LightbulbIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@acme/ui/empty";

import { loadPortal } from "./portal-data";
import { PortalShell } from "./portal-shell";

export const metadata = { title: "Feedback" };

/** /feedback → the first board on the portal home (Canny's Feedback tab). */
export async function FeedbackIndexPage() {
  const portal = await loadPortal();
  const first =
    portal.boards.find((b) => b.show_on_portal_home) ?? portal.boards[0];
  if (first) redirect(`/feedback/${first.slug}`);
  return (
    <PortalShell portal={portal}>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LightbulbIcon />
          </EmptyMedia>
          <EmptyTitle>No boards yet</EmptyTitle>
          <EmptyDescription>
            {portal.viewer?.staff
              ? "Create a board in /admin → Feedback → Boards and make it public."
              : "Check back soon."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </PortalShell>
  );
}
