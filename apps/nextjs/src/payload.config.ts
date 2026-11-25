import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { formBuilderPlugin } from "@payloadcms/plugin-form-builder";
import { nestedDocsPlugin } from "@payloadcms/plugin-nested-docs";
import { seoPlugin } from "@payloadcms/plugin-seo";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import { buildConfig } from "payload";
import sharp from "sharp";

import type { SmtpEnv } from "./lib/email/smtp";
import type { S3ConfigSource } from "./lib/s3-config";
import { resolveCmsCredentials } from "./lib/cms/derived-credentials";
import { generateMediaFileURL } from "./lib/cms/media-url";
import { mergePayloadMigrations } from "./lib/cms/merge-migrations";
import { noDocumentLock } from "./lib/cms/no-document-lock";
import { CMS_CLI_PROCESS_ENV, cmsPoolSizing } from "./lib/cms/pool-sizing";
import { isCronAuthorized } from "./lib/cron-secret";
import { pgConnectionOptions } from "./lib/db/bootstrap-core";
import { isGuardedPreview } from "./lib/db/preview-guard";
import { resolveSmtpConfig } from "./lib/email/smtp";
import { resolveS3Config } from "./lib/s3-config";
import {
  modCollections,
  modGlobals,
  modPayloadMigrations,
  modPlugins,
} from "./mod/registry.payload.generated";
import { isStaff } from "./payload/access";
import { Audio } from "./payload/collections/Audio";
import { Banners } from "./payload/collections/Banners";
import { Categories } from "./payload/collections/Categories";
import { Comments } from "./payload/collections/Comments";
import { CommunityPosts } from "./payload/collections/CommunityPosts";
import { CommunitySpaces } from "./payload/collections/CommunitySpaces";
import { DeviceTokens } from "./payload/collections/DeviceTokens";
import { Enrollments } from "./payload/collections/Enrollments";
import { Events } from "./payload/collections/Events";
import { FeedTokens } from "./payload/collections/FeedTokens";
import { KitModules } from "./payload/collections/KitModules";
import { LegalPages } from "./payload/collections/LegalPages";
import { Lessons } from "./payload/collections/Lessons";
import { Locations } from "./payload/collections/Locations";
import { Media } from "./payload/collections/Media";
import { NavItems } from "./payload/collections/NavItems";
import { Notifications } from "./payload/collections/Notifications";
import { Onboarding } from "./payload/collections/Onboarding";
import { Pages } from "./payload/collections/Pages";
import { Photos } from "./payload/collections/Photos";
import { Posts } from "./payload/collections/Posts";
import { Reports } from "./payload/collections/Reports";
import { Reviews } from "./payload/collections/Reviews";
import { Series } from "./payload/collections/Series";
import { SpaceGroups } from "./payload/collections/SpaceGroups";
import { TagGroups, Tags } from "./payload/collections/Tags";
import { Users } from "./payload/collections/Users";
import { Videos } from "./payload/collections/Videos";
import { AuthenticationSettings } from "./payload/globals/AuthenticationSettings";
import { DreamSite } from "./payload/globals/DreamSite";
import { ImageGenerationSettings } from "./payload/globals/ImageGenerationSettings";
import { NativeNavigation } from "./payload/globals/NativeNavigation";
import { ProfileFields } from "./payload/globals/ProfileFields";
import { SiteSettings } from "./payload/globals/SiteSettings";
import { ThemeSettings } from "./payload/globals/ThemeSettings";
import {
  withCollectionCacheInvalidation,
  withGlobalCacheInvalidation,
} from "./payload/hooks/revalidate-cache";
import { coreTasks } from "./payload/jobs";
import { migrations } from "./payload/migrations";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// PAYLOAD_SECRET / PAYLOAD_DATABASE_URL when set; otherwise derived from the
// Supabase env the Vercel integration injects, so a clone-and-connect deploy
// needs no manual CMS setup (see lib/cms/derived-credentials.ts — the runtime
// DB bootstrap creates the payload_cms role with the same derived password).
const cmsCredentials = resolveCmsCredentials();

// `next build` prerenders the public pages before any server has booted, so on
// a fresh project Payload can't connect yet — the payload_cms role is created
// at first server boot by the runtime DB bootstrap (lib/db/bootstrap.ts), not
// at build time. Every build-time reader already degrades to defaults
// (lib/payload.ts), but the adapter logs a pino ERROR ("cannot connect to
// Postgres") before throwing; silence the logger for that expected failure so
// build output stays clean. NEXT_PHASE is set by Next itself during the build.
const buildPhase = process.env.NEXT_PHASE === "phase-production-build";
// A preview deployment of an unmerged branch must not run boot migrations
// against the (usually shared, production) database — lib/db/preview-guard.ts.
const guardedPreview = isGuardedPreview({
  VERCEL_ENV: process.env.VERCEL_ENV,
  DB_BOOTSTRAP: process.env.DB_BOOTSTRAP,
});

// `pnpm cms:seed` / `pnpm cms:backfill-users` set this marker (via
// scripts/mark-cli-process.mjs) so the one-shot CLI process gets a wider pool
// than a serverless instance. Internal process marker, not user config.
const cliProcess = process.env[CMS_CLI_PROCESS_ENV] === "true";

// Outgoing email for the app's own notices (e.g. the phone-changed security
// email, payload/hooks/notify-contact-change.ts) via SMTP_* — see
// lib/email/smtp.ts. Unset → Payload's default: emails are logged, not sent.
const smtp = resolveSmtpConfig(process.env as SmtpEnv);

// S3 (Supabase Storage) config — dedicated keys or derived Supabase
// session-token mode (see lib/s3-config.ts). Falls back to empty credentials
// when unconfigured so the adapter still registers (uploads no-op until set).
const s3 = resolveS3Config(process.env as S3ConfigSource) ?? {
  bucket: process.env.S3_BUCKET ?? "cms-media",
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true as const,
  credentials: { accessKeyId: "", secretAccessKey: "" },
};

export default buildConfig({
  ...(buildPhase ? { logger: { options: { level: "silent" } } } : {}),
  // Payload's own admin auth (content editors), separate from Supabase Auth.
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname, "app/(payload)") },
    // Favicon set for the /admin chrome (same RealFaviconGenerator output in
    // /public). Payload's meta extends Next.js Metadata, so we declare the SVG +
    // PNG + apple-touch icons explicitly rather than relying on Payload's default.
    meta: {
      titleSuffix: "· Admin",
      icons: [
        { rel: "icon", type: "image/x-icon", url: "/favicon.ico" },
        { rel: "icon", type: "image/svg+xml", url: "/favicon.svg" },
        {
          rel: "icon",
          type: "image/png",
          sizes: "96x96",
          url: "/favicon-96x96.png",
        },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          url: "/apple-touch-icon.png",
        },
      ],
    },
    // Always in the import map: module pages render modules' own settings
    // components through this one wrapper (payload/components/
    // ModuleAdminSettings.tsx), so installing a module never needs a new
    // import-map entry.
    dependencies: {
      moduleAdminSettings: {
        path: "~/payload/components/ModuleAdminSettings#ModuleAdminSettings",
        type: "component",
      },
    },
    components: {
      // Dream brand marks in the admin chrome: the icon in the breadcrumb
      // (step-nav home) and the logo on the login/reset/unauthorized screens.
      // See payload/components/BrandIcon.tsx + BrandLogo.tsx.
      graphics: {
        Icon: "~/payload/components/BrandIcon#BrandIcon",
        Logo: "~/payload/components/BrandLogo#BrandLogo",
      },
      // On first boot (no content yet) this redirects the freshly-created admin
      // to /cms-setup, which seeds demo content with a progress bar. Self-
      // disables once the CMS has content. See payload/components/SeedGate.tsx.
      beforeDashboard: [
        "~/payload/components/SeedGate#SeedGate",
        // Module ops setup steps (MOD_OPS_TOKEN) until it's configured —
        // see payload/components/ModOpsSetupAlert.tsx.
        "~/payload/components/ModOpsSetupAlert#ModOpsSetupAlert",
        "~/payload/components/DreamSiteSync#DreamSiteSync",
      ],
      // Wraps every admin route and injects the site-wide shadcn theme as a
      // <style> (from the theme-settings global) so the admin chrome follows the
      // same theme as the front end. See payload/components/ThemeStyleProvider.tsx.
      providers: [
        "~/payload/components/ThemeStyleProvider#ThemeStyleProvider",
        // Supabase + react-query for module settings components on their
        // module's page (manifest admin.settingsComponent).
        "~/payload/components/ModAdminProviders#ModAdminProviders",
      ],
      // CMS auth is SSO from the Supabase session (no payload-token), so the
      // default logout can't end the session. Replace it with one that signs out
      // of Supabase and returns to the host root. See payload/components/LogoutButton.tsx.
      logout: { Button: "~/payload/components/LogoutButton#LogoutButton" },
      // Sidebar with accordion groups: one open at a time, and the group of
      // the current page open on load. See payload/components/AdminNav.tsx.
      Nav: "~/payload/components/AdminNav#AdminNav",
      // Module install/update/remove lives on the Modules collection screen
      // (payload/collections/KitModules.ts + payload/components/modules/).
      views: {
        // /admin/module-settings/<slug> → the module's page (its settings).
        moduleSettings: {
          Component:
            "~/payload/components/ModuleSettingsRedirect#ModuleSettingsRedirect",
          path: "/module-settings/:slug",
        },
      },
    },
  },
  // Admin at /admin; REST API moved OFF /api to /cms-api so it never collides
  // with the app's existing /api/chat, /api/stripe/*, /api/push/* routes.
  routes: {
    admin: "/admin",
    api: "/cms-api",
  },
  collections: [
    // People
    Users,
    DeviceTokens,
    FeedTokens,
    Enrollments,
    Reviews,
    // Content
    Media,
    Posts,
    Videos,
    Audio,
    Photos,
    Series,
    Lessons,
    Locations,
    Events,
    Categories,
    Tags,
    TagGroups,
    // Community
    SpaceGroups,
    CommunitySpaces,
    CommunityPosts,
    Comments,
    Reports,
    // Marketing
    Pages,
    Onboarding,
    Banners,
    Notifications,
    // System
    LegalPages,
    // Modules (framework-owned: install registry + CMS-driven menu)
    KitModules,
    NavItems,
    // Installed modules' collections (generated registry — `pnpm mod sync`)
    ...modCollections,
  ]
    .map(noDocumentLock)
    .map(withCollectionCacheInvalidation),
  globals: [
    SiteSettings,
    ThemeSettings,
    ImageGenerationSettings,
    ProfileFields,
    AuthenticationSettings,
    DreamSite,
    NativeNavigation,
    // Installed modules' globals incl. their settings screens (§1.7)
    ...modGlobals,
  ]
    .map(noDocumentLock)
    .map(withGlobalCacheInvalidation),
  // One shared, cross-collection folder tree ("Browse by Folder") for the
  // collections that enable `folders: true`.
  folders: { browseByFolder: true },
  // Payload Jobs Queue — the app's background work (payload/jobs) plus
  // scheduled publishing (`schedulePublish` on the content collections).
  // Supabase Cron calls `GET /cms-api/payload-jobs/run?allQueues=true` every
  // minute with the cron bearer secret (lib/cron-secret.ts); the endpoint
  // queues due scheduled tasks, then runs a bounded batch. Signed-in staff
  // may also trigger it. Never `autoRun` — it doesn't work on serverless.
  jobs: {
    tasks: coreTasks,
    access: {
      run: ({ req }) =>
        Boolean(req.user) ||
        isCronAuthorized(req.headers.get("authorization"), {
          CRON_SECRET: process.env.CRON_SECRET,
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        }),
    },
    deleteJobOnComplete: true,
  },
  editor: lexicalEditor(),
  secret: cmsCredentials.secret ?? "",
  // Generated types are published from the @acme/cms package so the Expo app and
  // shared hooks can import them without pulling in Payload's Node runtime.
  typescript: {
    // Don't emit the `declare module 'payload'` augmentation into the shared
    // types package — that would force `payload` to be a dependency of
    // @acme/cms and the Expo app. We re-declare it locally where Payload's
    // Local API is used: apps/nextjs/src/payload-augment.d.ts.
    declare: false,
    outputFile: path.resolve(
      dirname,
      "../../../packages/cms/src/payload-types.ts",
    ),
  },
  db: postgresAdapter({
    // pgConnectionOptions gives the pool libpq ssl semantics (sslmode=require
    // → encrypted-unverified, param stripped) — hosted Supabase's self-rooted
    // cert chain fails pg's default verify-full handling otherwise. Local
    // plaintext URLs pass through untouched.
    //
    // This is the PER-REQUEST query pool, so it uses `runtimeDatabaseUrl`: on
    // the Vercel<->Supabase integration that's the TRANSACTION-mode pooler
    // (6543), NOT the session-mode one (5432) that the bootstrap / DDL /
    // advisory-lock paths use (`databaseUrl`). Why: a fresh deploy cold-starts
    // many serverless instances at once, each with its own pool; session mode
    // dedicates one Postgres backend per client and caps clients at ~pool_size
    // (15) per role, so the burst collectively blew the cap and every request
    // 500'd with "EMAXCONNSESSION max clients reached in session mode" for the
    // first 1-3 minutes after a deploy. Transaction mode (Supavisor) holds a
    // backend only for the duration of a transaction, so it multiplexes and has
    // no per-role client cap to exhaust. See resolveRuntimeDbUrl.
    //
    // Transaction-mode caveats, both satisfied here:
    //   - Prepared statements: a multiplexed pooler can't keep SESSION-level
    //     named prepared statements (the next query may land on a different
    //     backend). Payload's adapter is `@payloadcms/db-postgres` on drizzle +
    //     node-postgres (`pg`), and `pg` uses the UNNAMED prepared statement
    //     (re-parsed per execute, never persisted) — safe per-transaction. We
    //     don't issue `.prepare()`d statements, so nothing to disable.
    //   - search_path: the role itself carries `alter role payload_cms set
    //     search_path = cms` (cmsProvisionStatements / 00_cms_role.sql), so every
    //     backend the pooler hands out resolves `cms` regardless of multiplexing;
    //     the URL's `options=-c search_path=cms` reinforces it, and Payload also
    //     schema-qualifies identifiers from `schemaName: "cms"`.
    //
    // The pool stays SMALL per instance: `max: 2` is plenty for a read-heavy
    // request and keeps each instance's footprint on the shared pooler modest
    // (transaction mode lifts the hard session cap, but courtesy still matters).
    // Starvation must FAIL, not wait: pg's default acquire wait is infinite, so
    // a wedged pool used to ride out Vercel's 300s timeout — and the killed
    // invocation left its transaction open, poisoning the still-warm Fluid
    // instance (and pinning Supavisor slots) for every later request.
    // connectionTimeoutMillis bounds the acquire wait; idle connections are
    // released quickly so frozen instances give slots back; and
    // idle_in_transaction_session_timeout has Postgres reap abandoned
    // transactions (releasing their row locks + pooler slots) within 60s.
    // Hook authors: always pass `req` to nested Local API calls — a req-less
    // call inside a transaction checks out a second connection and is exactly
    // how such a wedge forms (see payload/hooks/validate-custom-fields.ts).
    //
    // The sizing (max 2 / 20s idle / 15s acquire) lives in lib/cms/pool-sizing.ts;
    // only the CMS CLI scripts get a wider pool there (dev push introspection
    // queries every table concurrently and starves a 2-connection pool).
    pool: {
      ...pgConnectionOptions(cmsCredentials.runtimeDatabaseUrl),
      ...cmsPoolSizing({ cli: cliProcess }),
      idle_in_transaction_session_timeout: 60_000,
    },
    // Payload owns its own Postgres schema, isolated from the RLS-governed
    // `public` tables. It connects as the least-privilege `payload_cms` role.
    schemaName: "cms",
    // Dev/CI auto-creates the cms tables via dev "push" (so a fresh clone needs
    // no migration step). Push runs only at Payload INIT — if the database is
    // wiped while the server is running (`supabase db reset` without
    // `pnpm db:reset`), the first-login flows self-heal by applying the
    // committed migrations at request time (lib/cms/ensure-schema.ts).
    // In production (NODE_ENV=production) push is OFF; instead
    // Payload runs `prodMigrations` automatically on first connect, so a fresh
    // prod database self-provisions the cms schema on the first request — no
    // separate `pnpm cms:migrate` deploy step required (it stays idempotent via
    // the cms.payload_migrations ledger). After changing a collection, regenerate
    // with `pnpm cms:migrate:create` and commit the new file in payload/migrations.
    push: process.env.NODE_ENV !== "production",
    // Core + module migrations merged by timestamp prefix and DEDUPED by name:
    // `mod sync` copies module migrations into the core dir, and Payload's
    // migrate() reads its ledger once, so a duplicate name would run twice on a
    // fresh database (see lib/cms/merge-migrations.ts).
    //
    // NOT registered during `next build`. In production mode the adapter runs
    // `prodMigrations` automatically the first time it connects (db-postgres
    // `connect.ts`) — but `next build` also runs in production mode and warms
    // Payload while prerendering pages. If the build's database was ever dev-
    // pushed (e.g. a local `pnpm dev`/`pnpm cms:seed` ran first, leaving the
    // `batch: -1` dev marker in `cms.payload_migrations`), that auto-migrate
    // hits Payload's interactive "you've run in dev mode … run migrations?
    // (y/N)" prompt. The non-TTY build workers block on it until the 60s
    // per-page timeout fires, so static generation flakes/fails (it passed on
    // a freshly-migrated DB with no dev marker, e.g. CI's healthy-stack job —
    // hence the intermittence). The build never needs migrations run anyway;
    // gating them to the real server boot removes the prompt path entirely.
    // `NEXT_PHASE` is propagated to the static-gen worker processes, so the
    // gate holds there too.
    // Also not registered on a guarded preview deployment (see above).
    prodMigrations:
      buildPhase || guardedPreview
        ? undefined
        : mergePayloadMigrations(migrations, modPayloadMigrations),
    migrationDir: path.resolve(dirname, "payload/migrations"),
  }),
  sharp,
  ...(smtp ? { email: nodemailerAdapter(smtp) } : {}),
  plugins: [
    s3Storage({
      // photos + audio are upload collections in their own right (the app's
      // Photos/Podcast sections); prefixes keep their objects separated from
      // the general media store inside the one bucket.
      //
      // `disablePayloadAccessControl: true` + `generateFileURL` make every
      // upload resolve to its PUBLIC Supabase Storage object URL instead of the
      // access-controlled `/cms-api/<coll>/file/<filename>` path. That path
      // boots Payload and opens a Postgres connection per image request; a
      // public page of many images × concurrent visitors can saturate
      // Supabase's pooler ("EMAXCONN … limit: 200") and 500 the site. The
      // cms-media bucket is public-read by design, so serving the CDN URL
      // directly is correct and costs zero DB connections. See lib/cms/media-url.ts.
      collections: {
        media: {
          disablePayloadAccessControl: true,
          generateFileURL: generateMediaFileURL,
        },
        photos: {
          prefix: "photos",
          disablePayloadAccessControl: true,
          generateFileURL: generateMediaFileURL,
        },
        audio: {
          prefix: "audio",
          disablePayloadAccessControl: true,
          generateFileURL: generateMediaFileURL,
        },
      },
      // Raw process.env (the Payload CLI loads this config without full env
      // validation). resolveS3Config supports dedicated S3 keys OR Supabase
      // session-token mode (deriving endpoint + region), so a Vercel↔Supabase
      // integration deploy needs zero S3-specific env. Falls back to empty
      // credentials when unconfigured (uploads just won't work — image
      // generation's isS3Configured guard skips before spending on the gateway).
      bucket: s3.bucket,
      config: {
        endpoint: s3.endpoint,
        region: s3.region,
        forcePathStyle: true, // required for Supabase's S3-compatible endpoint
        credentials: s3.credentials,
      },
    }),
    seoPlugin({
      collections: [
        "posts",
        "videos",
        "audio",
        "photos",
        "pages",
        "legal",
        "events",
        "locations",
        "series",
      ],
      uploadsCollection: "media",
    }),
    // Hierarchies (parent + auto-maintained breadcrumbs) for taxonomy, page
    // trees and community space groups.
    nestedDocsPlugin({
      collections: ["categories", "pages", "space-groups"],
    }),
    formBuilderPlugin({
      fields: {
        text: true,
        textarea: true,
        email: true,
        select: true,
        checkbox: true,
        number: true,
        message: true,
        country: false,
        state: false,
        payment: false,
      },
      redirectRelationships: ["pages"],
      formOverrides: {
        admin: { group: "Marketing" },
        // Surface a form's submissions inline (inverse of form-submissions.form)
        // so the form is the single page for both — submissions are hidden from
        // the nav below.
        fields: ({ defaultFields }) => [
          ...defaultFields,
          {
            name: "submissions",
            type: "join",
            collection: "form-submissions",
            on: "form",
            admin: {
              defaultColumns: ["createdAt"],
              description: "Submissions received for this form.",
            },
          },
        ],
      },
      formSubmissionOverrides: {
        admin: { group: "Marketing", hidden: true },
        access: { read: isStaff, delete: isStaff },
      },
    }),
    // Plugins registered by installed modules (generated registry). A
    // plugin can mutate the whole Payload config — the widest module
    // power; install PRs flag it prominently (MODULES-PLAN.md §3.2).
    ...modPlugins,
  ],
});
