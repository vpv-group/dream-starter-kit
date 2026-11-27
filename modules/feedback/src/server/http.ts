import type { z } from "zod/v4";

import type { ModRouteContext } from "@acme/mod-kit/server";

/** Small helpers shared by the feedback route handlers. */

export const json = (status: number, body: unknown) =>
  Response.json(body, { status });

export const ok = (body: unknown = { ok: true }) => json(200, body);

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Parse a JSON body with a zod schema; 400 with the first issue on failure. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      400,
      issue
        ? `${issue.path.join(".") || "body"}: ${issue.message}`
        : "Invalid body.",
      "invalid_body",
    );
  }
  return parsed.data;
}

/** Wrap a handler so HttpError (and Postgres permission errors) map to JSON. */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(err.status, { error: err.message, code: err.code });
      }
      const pg = err as { code?: string; message?: string };
      if (pg.code === "42501") {
        return json(403, {
          error: pg.message ?? "Not allowed",
          code: "forbidden",
        });
      }
      if (pg.code === "23503" || pg.code === "22023") {
        return json(400, { error: pg.message ?? "Invalid request" });
      }
      console.error("[feedback] route failed:", err);
      return json(500, { error: "Something went wrong." });
    }
  };
}

/** Throw the Supabase error (keeps its Postgres code for `handle`). */
export function must<T>(res: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (res.error) throw Object.assign(new Error(res.error.message), res.error);
  return res.data as NonNullable<T>;
}

/** 403 unless the caller is feedback staff (checked in SQL, per request). */
export async function requireStaff(ctx: {
  supabase: ModRouteContext["supabase"];
}): Promise<void> {
  const { data } = await ctx.supabase.rpc("mod_feedback_is_staff");
  if (!data) throw new HttpError(403, "Staff only.", "forbidden");
}

/** A staff-only route: `handle` + `requireStaff`. */
export function staff(
  fn: (req: Request, ctx: ModRouteContext) => Promise<Response>,
): (req: Request, ctx: ModRouteContext) => Promise<Response> {
  return handle(async (req: Request, ctx: ModRouteContext) => {
    await requireStaff(ctx);
    return fn(req, ctx);
  });
}
