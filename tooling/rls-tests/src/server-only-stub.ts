// `import "server-only"` throws outside a Server Components build; module
// RLS suites exercise server code against the live database, so it's a no-op
// here (vitest.config.ts aliases it).
export {};
