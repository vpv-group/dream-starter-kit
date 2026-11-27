import type { Metadata } from "next";
import type { ReactNode } from "react";

import { EmbedProviders } from "~/components/embed-providers";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Bare layout for embeddable module pages (manifest `area: "embed"`,
 * /embed/<slug>/…): no site header/footer or app shell, so the page fits an
 * iframe on another site. Theme and fonts come from the root layout.
 * proxy.ts limits who may frame these pages (frame-ancestors).
 */
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return <EmbedProviders>{children}</EmbedProviders>;
}
