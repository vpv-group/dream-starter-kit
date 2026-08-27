import type { ReactNode } from "react";

import { LegalNav } from "~/components/legal/legal-nav";
import { listLegalPages } from "~/lib/payload";

export const dynamic = "force-dynamic";

/**
 * The /legal shell: a table-of-contents sidebar listing every published legal
 * document (Upwork-legal-style), with the selected document rendered beside
 * it. The list comes from the `legal` CMS collection, so staff add/reorder
 * documents from the admin — no code changes.
 */
export default async function LegalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const docs = await listLegalPages();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        <aside className="mb-8 lg:sticky lg:top-24 lg:mb-0 lg:self-start">
          <LegalNav
            docs={docs.map((doc) => ({ title: doc.title, slug: doc.slug }))}
          />
        </aside>
        <main className="max-w-[40rem] min-w-0">{children}</main>
      </div>
    </div>
  );
}
