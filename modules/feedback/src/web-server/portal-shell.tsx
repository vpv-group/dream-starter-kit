import type { ReactNode } from "react";

import type { Portal } from "./portal-data";
import { AuthPromptProvider } from "../web/components/auth-prompt";
import { PortalHeader } from "../web/components/portal-header";

/**
 * The feedback portal frame shared by /roadmap, /feedback and /changelog:
 * the tab row under the site header, then content centered at 60rem
 * (gutters: 16px on phones, 32px on tablets, auto on desktop).
 */
export function PortalShell({
  portal,
  activeBoardSlug,
  canCreate,
  children,
}: {
  portal: Portal;
  activeBoardSlug?: string;
  canCreate?: boolean;
  children: ReactNode;
}) {
  const boards = portal.boards
    .filter((b) => b.show_on_portal_home || b.slug === activeBoardSlug)
    .map((b) => ({ slug: b.slug, name: b.name, post_count: b.post_count }));
  return (
    <AuthPromptProvider title={portal.settings.portalTitle ?? "Feedback"}>
      <PortalHeader
        tabs={portal.tabs}
        boards={boards}
        activeBoardSlug={activeBoardSlug}
        canCreate={canCreate}
      />
      <main className="mx-auto w-full max-w-[60rem] px-4 py-6 md:px-8 md:py-8 lg:px-0">
        {children}
      </main>
    </AuthPromptProvider>
  );
}
