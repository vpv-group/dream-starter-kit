/**
 * @acme/mod-kit — the module framework's typed contracts.
 *
 * This barrel is CLIENT-SAFE (no payload, no node built-ins): manifest types +
 * `defineModule` + pure validation logic. Server route contracts live in
 * `@acme/mod-kit/server`; Payload-side helpers (settings, seed steps) live in
 * `@acme/mod-kit/payload`.
 */
export * from "./manifest";
export * from "./validate";
