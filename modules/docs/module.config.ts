import { defineModule } from "@acme/mod-kit";

/**
 * Docs — a public developer-documentation site at /docs (cursor.com/docs-style
 * UX: sidebar nav + article + on-this-page TOC, ⌘K search, an "Ask AI" panel,
 * and "Explain more"). Content lives in the CMS (mod-docs-pages) and can be
 * authored in /admin or synced from a public GitHub repo's docs folder (the
 * mod-docs-settings global drives the sync). No Supabase tables — content is
 * Payload-governed; the /ask AI route is authed + rate-limited by the
 * dispatcher (golden rule #6), search is public.
 */
export default defineModule({
  slug: "docs",
  name: "Docs",
  version: "1.0.0",
  kitCompat: ">=2.0.0 <3",
  description: "Public developer docs with GitHub sync + Ask-AI.",
  nav: {},
  routes: {
    web: [
      {
        path: "",
        component: "DocsIndexPage",
        area: "public",
        mount: "/docs",
        rsc: true,
      },
      {
        path: "[slug]",
        component: "DocsDetailPage",
        area: "public",
        mount: "/docs",
        rsc: true,
      },
    ],
  },
  server: {
    routes: true,
    publicRoutes: true,
  },
  cms: {
    collections: ["mod-docs-pages"],
    hasSettings: true,
    hasMigrations: true,
    hasSeed: true,
  },
});
