import type { Metadata } from "next";
import Link from "next/link";

import { listLegalPages } from "~/lib/payload";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Legal",
  description: "Terms, policies and other legal documents.",
};

/** The /legal index: every published legal document, in TOC order. */
export default async function LegalIndexPage() {
  const docs = await listLegalPages();

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Legal
      </h1>
      <p className="text-muted-foreground mt-3 text-lg">
        The agreements and policies that govern your use of this site.
      </p>
      <ul className="divide-border mt-8 divide-y border-y">
        {docs.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={`/legal/${doc.slug}`}
              className="hover:bg-muted/50 -mx-3 flex items-baseline justify-between gap-4 rounded-md px-3 py-4 transition-colors"
            >
              <span className="font-medium">{doc.title}</span>
              {doc.effectiveDate && (
                <span className="text-muted-foreground shrink-0 text-sm">
                  Effective {new Date(doc.effectiveDate).toLocaleDateString()}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {docs.length === 0 && (
        <p className="text-muted-foreground mt-8">
          No legal documents have been published yet.
        </p>
      )}
    </div>
  );
}
