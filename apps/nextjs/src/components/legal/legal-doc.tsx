import type { Legal } from "@acme/cms";

import { CmsRichText } from "~/components/rich-text";

/**
 * Renders one legal document (title, effective date, rich-text body). Shared
 * by the public /legal/[slug] page and the admin Live Preview wrapper, so both
 * render identically. Plain presentational component — no hooks.
 */
export function LegalDoc({ doc }: { doc: Legal }) {
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {doc.title}
      </h1>
      {doc.effectiveDate && (
        <p className="text-muted-foreground mt-2 text-sm">
          Effective {new Date(doc.effectiveDate).toLocaleDateString()}
        </p>
      )}
      <div className="mt-8">
        <CmsRichText data={doc.content} />
      </div>
    </article>
  );
}
