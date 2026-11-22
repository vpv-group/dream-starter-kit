import { modulesLock } from "../../mod/lock.generated";

/**
 * Does this op touch a paid module? Installing a `dream:` source, or updating
 * a module installed from the Dream registry. Removing one never is.
 */
export function isPaidOp(
  input: { op: string; source?: string; slug?: string },
  lock: { modules: object } = modulesLock,
): boolean {
  if (input.op === "add") return (input.source ?? "").startsWith("dream:");
  if (input.op === "update" && input.slug) {
    const entry = (
      lock.modules as Record<string, { source?: unknown } | undefined>
    )[input.slug];
    const src = entry?.source;
    return (
      typeof src === "object" &&
      src !== null &&
      (src as { type?: unknown }).type === "registry"
    );
  }
  return false;
}
