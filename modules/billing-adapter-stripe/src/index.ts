/**
 * Client-safe barrel. The Stripe adapter has no client API of its own: its
 * browser surface is the web contract billing reads with
 * `useModAdapters("billing")` (./web → `webProvider`).
 */
export {};
