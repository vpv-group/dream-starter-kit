import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import type { AccountModel } from "@acme/app";

import { getPayloadClient } from "~/lib/cms/payload-client";

/**
 * Founder step of /cms-setup (wireframe AccountModel): saves
 * `authentication-settings.accountModel` and stamps `accountModelChosenAt`
 * so the picker is never shown again. Staff only — authenticated through the
 * Payload session (the Supabase SSO strategy only admits staff), and the
 * update runs with access control on, exactly like a save in /admin.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountModel: z.enum([
    "consumer",
    "business",
    "hybrid",
  ] satisfies AccountModel[]),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid account model" },
      { status: 400 },
    );
  }

  let payload: Awaited<ReturnType<typeof getPayloadClient>>;
  try {
    payload = await getPayloadClient();
  } catch (error) {
    console.error("[account-model] Payload init failed", error);
    return NextResponse.json({ error: "CMS unavailable" }, { status: 503 });
  }
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await payload.updateGlobal({
      slug: "authentication-settings",
      data: {
        accountModel: parsed.data.accountModel,
        accountModelChosenAt: new Date().toISOString(),
      },
      user,
      overrideAccess: false,
    });
  } catch (error) {
    console.error("[account-model] save failed", error);
    return NextResponse.json(
      { error: "Couldn't save your choice. Please retry." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
