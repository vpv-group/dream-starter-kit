/**
 * Core (host-owned) menu defaults. The list lives in @acme/app so the Expo
 * app builds its offline fallback menu from the same entries; this re-export
 * keeps the reconcile's import local.
 */
export { CORE_NAV_ITEMS, type CoreNavItem } from "@acme/app";
