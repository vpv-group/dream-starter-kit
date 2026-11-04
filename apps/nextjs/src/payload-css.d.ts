// `@payloadcms/next/css` is a stylesheet export (dist/prod/styles.css) that the
// admin layout imports for its side effect. Its specifier doesn't end in
// `.css`, so Next's `*.css` declarations don't cover it, and TS 6's
// `noUncheckedSideEffectImports` (on by default) needs a declaration for it.
declare module "@payloadcms/next/css";
