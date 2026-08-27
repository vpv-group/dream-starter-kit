import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";

import { LegalDoc } from "~/components/legal/legal-doc";
import { LegalLivePreview } from "~/components/legal/legal-live-preview";
import { getLegalPage } from "~/lib/payload";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getLegalPage(slug).catch(() => null);
  return {
    title: doc?.meta?.title ?? doc?.title ?? "Legal",
    description: doc?.meta?.description ?? undefined,
  };
}

export default async function LegalDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = await getLegalPage(slug);
  if (!doc) notFound();

  // In draft mode (Payload Live Preview) hand off to the client wrapper so
  // edits stream into the admin iframe live; otherwise render server-side.
  const { isEnabled } = await draftMode();
  if (isEnabled) return <LegalLivePreview initialData={doc} />;

  return <LegalDoc doc={doc} />;
}
