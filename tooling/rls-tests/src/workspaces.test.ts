/**
 * Workspaces (B2B) — RLS + security-definer RPC regression
 * (supabase/migrations/20261118000000_workspaces.sql, docs/WORKSPACES.md).
 *
 * Cross-org isolation, the RPC refusal paths (anon, reserved/duplicate slugs,
 * wrong-account/expired/revoked/used invites, join-link domain rules), the
 * co-member profile policy, the last-owner and active-workspace guards, and
 * that the invitee's window (my_pending_invitations) never exposes tokens.
 * Same env as rls.test.ts (pnpm test:rls).
 */
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@acme/api/types";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error("test:rls requires the Supabase URL, anon and service keys.");
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(SUPABASE_URL, SERVICE_KEY, noPersist);
const stamp = Date.now();
const password = "password123!";

const emails = {
  owner: `ws-owner-${stamp}@acme.test`,
  invitee: `ws-invitee-${stamp}@acme.test`,
  outsider: `ws-outsider-${stamp}@other.test`,
  joiner: `ws-joiner-${stamp}@acme.test`,
};

type Client = SupabaseClient<Database>;
const ids: Record<keyof typeof emails, string> = {
  owner: "",
  invitee: "",
  outsider: "",
  joiner: "",
};
const clients = {} as Record<keyof typeof emails, Client>;
let orgId = "";
let outsiderOrgId = "";
/** The invitee's emailed-invite token (plaintext only lives in the link). */
let inviteeToken = "";
const slug = `acme-${stamp}`;

const token = () => randomBytes(32).toString("base64url");
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

async function makeUser(email: string): Promise<[string, Client]> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, noPersist);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return [data.user.id, client];
}

async function invite(
  email: string,
  over: Partial<Database["public"]["Tables"]["invitations"]["Insert"]> = {},
): Promise<string> {
  const plain = token();
  const { error } = await admin.from("invitations").insert({
    org_id: orgId,
    email,
    role: "member",
    token_hash: sha256(plain),
    invited_by: ids.owner,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    ...over,
  });
  if (error) throw error;
  return plain;
}

beforeAll(async () => {
  for (const key of Object.keys(emails) as (keyof typeof emails)[]) {
    const [id, client] = await makeUser(emails[key]);
    ids[key] = id;
    clients[key] = client;
  }
  const created = await clients.owner.rpc("create_workspace", {
    _name: "Acme",
    _slug: slug,
  });
  expect(created.error).toBeNull();
  orgId = created.data?.id ?? "";
  expect(orgId).not.toBe("");

  const other = await clients.outsider.rpc("create_workspace", {
    _name: "Other",
    _slug: `other-${stamp}`,
  });
  expect(other.error).toBeNull();
  outsiderOrgId = other.data?.id ?? "";
});

afterAll(async () => {
  for (const id of [orgId, outsiderOrgId]) {
    if (id) await admin.from("organizations").delete().eq("id", id);
  }
  for (const id of Object.values(ids)) {
    if (id) await admin.auth.admin.deleteUser(id);
  }
});

describe("create_workspace", () => {
  it("makes the caller owner and the workspace active", async () => {
    const { data: membership } = await clients.owner
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", ids.owner)
      .single();
    expect(membership?.role).toBe("owner");
    const { data: profile } = await clients.owner
      .from("profiles")
      .select("last_org_id")
      .eq("id", ids.owner)
      .single();
    expect(profile?.last_org_id).toBe(orgId);
  });

  it("refuses duplicate, reserved and malformed slugs", async () => {
    const dup = await clients.invitee.rpc("create_workspace", {
      _name: "Copycat",
      _slug: slug,
    });
    expect(dup.error?.message).toBe("slug_unavailable");
    const reserved = await clients.invitee.rpc("create_workspace", {
      _name: "Admin",
      _slug: "admin",
    });
    expect(reserved.error?.message).toBe("slug_unavailable");
    const bad = await clients.invitee.rpc("create_workspace", {
      _name: "Bad",
      _slug: "-bad--slug",
    });
    expect(bad.error?.message).toBe("invalid_slug");
    const noName = await clients.invitee.rpc("create_workspace", {
      _name: "   ",
      _slug: `noname-${stamp}`,
    });
    expect(noName.error?.message).toBe("invalid_name");
  });

  it("is_slug_available reflects format, reserved words and uniqueness", async () => {
    const check = async (s: string) =>
      (await clients.invitee.rpc("is_slug_available", { _slug: s })).data;
    expect(await check(slug)).toBe(false);
    expect(await check("cms-setup")).toBe(false);
    expect(await check("Upper")).toBe(false);
    expect(await check(`free-${stamp}`)).toBe(true);
  });

  it("a direct insert can't bypass the reserved-slug rule", async () => {
    const { error } = await clients.invitee
      .from("organizations")
      .insert({ name: "Sneaky", slug: "api", owner_id: ids.invitee });
    expect(error).not.toBeNull();
  });

  it("refuses anonymous sessions, and anon can't read workspace tables", async () => {
    const anon = createClient<Database>(SUPABASE_URL, ANON_KEY, noPersist);
    const signed = await anon.auth.signInAnonymously();
    expect(signed.error).toBeNull();
    const anonId = signed.data.user?.id ?? "";
    try {
      const res = await anon.rpc("create_workspace", {
        _name: "Anon",
        _slug: `anon-${stamp}`,
      });
      expect(res.error?.message).toBe("not_allowed");
      const { data: orgs } = await anon.from("organizations").select("id");
      expect(orgs).toHaveLength(0);
    } finally {
      if (anonId) await admin.auth.admin.deleteUser(anonId);
    }
  });

  it("is not executable without a session", async () => {
    const signedOut = createClient<Database>(SUPABASE_URL, ANON_KEY, noPersist);
    const res = await signedOut.rpc("create_workspace", {
      _name: "Nobody",
      _slug: `nobody-${stamp}`,
    });
    expect(res.error).not.toBeNull();
  });
});

describe("cross-workspace isolation", () => {
  it("an outsider can't read the workspace, its memberships or invites", async () => {
    await invite(`peek-${stamp}@acme.test`);
    const c = clients.outsider;
    expect(
      (await c.from("organizations").select("id").eq("id", orgId)).data,
    ).toHaveLength(0);
    expect(
      (await c.from("memberships").select("id").eq("org_id", orgId)).data,
    ).toHaveLength(0);
    expect(
      (await c.from("invitations").select("id").eq("org_id", orgId)).data,
    ).toHaveLength(0);
  });

  it("an outsider can't point their active workspace at it", async () => {
    const { error } = await clients.outsider
      .from("profiles")
      .update({ last_org_id: orgId })
      .eq("id", ids.outsider);
    expect(error?.message).toBe("not_a_member");
  });

  it("an outsider can't save onboarding progress in it", async () => {
    const { error } = await clients.outsider.rpc("save_onboarding_progress", {
      _org_id: orgId,
      _step: "profile",
    });
    expect(error?.message).toBe("not_a_member");
  });
});

describe("accept_invitation", () => {
  it("refuses the wrong account, expired, revoked and unknown tokens", async () => {
    inviteeToken = await invite(emails.invitee);
    const wrong = await clients.outsider.rpc("accept_invitation", {
      _token: inviteeToken,
    });
    expect(wrong.error?.message).toBe("invite_wrong_account");

    const expired = await invite(`exp-${stamp}@acme.test`, {
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const exp = await clients.invitee.rpc("accept_invitation", {
      _token: expired,
    });
    expect(exp.error?.message).toBe("invite_expired");

    const revoked = await invite(`rev-${stamp}@acme.test`, {
      status: "revoked",
    });
    const rev = await clients.invitee.rpc("accept_invitation", {
      _token: revoked,
    });
    expect(rev.error?.message).toBe("invite_revoked");

    const unknown = await clients.invitee.rpc("accept_invitation", {
      _token: token(),
    });
    expect(unknown.error?.message).toBe("invite_not_found");
  });

  it("before joining, the invitee sees the invite only via my_pending_invitations — never the token", async () => {
    const { data, error } = await clients.invitee.rpc("my_pending_invitations");
    expect(error).toBeNull();
    const row = data?.find((r) => r.org_id === orgId);
    expect(row?.org_slug).toBe(slug);
    expect(row?.role).toBe("member");
    expect(Object.keys(row ?? {})).not.toContain("token_hash");
    expect(JSON.stringify(data)).not.toMatch(/token/i);

    const direct = await clients.invitee
      .from("invitations")
      .select("id")
      .eq("org_id", orgId);
    expect(direct.data).toHaveLength(0);

    const outsider = await clients.outsider.rpc("my_pending_invitations");
    expect(outsider.data?.find((r) => r.org_id === orgId)).toBeUndefined();
  });

  it("co-member profiles stay private until the invitee joins", async () => {
    const before = await clients.invitee
      .from("profiles")
      .select("id")
      .eq("id", ids.owner);
    expect(before.data).toHaveLength(0);
  });

  it("the invited email joins as the invited role, idempotently", async () => {
    const accepted = await clients.invitee.rpc("accept_invitation", {
      _token: inviteeToken,
    });
    expect(accepted.error).toBeNull();
    expect(accepted.data?.id).toBe(orgId);

    const again = await clients.invitee.rpc("accept_invitation", {
      _token: inviteeToken,
    });
    expect(again.error).toBeNull();

    const usedByOther = await clients.joiner.rpc("accept_invitation", {
      _token: inviteeToken,
    });
    expect(usedByOther.error?.message).toBe("invite_used");

    const { data: membership } = await clients.invitee
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", ids.invitee)
      .single();
    expect(membership?.role).toBe("member");
  });

  it("co-members can't read each other's profile rows, but see safe columns via workspace_members", async () => {
    const rows = await clients.invitee
      .from("profiles")
      .select("id, phone")
      .eq("id", ids.owner);
    expect(rows.data).toHaveLength(0);

    const { data: members, error } = await clients.invitee.rpc(
      "workspace_members",
      { _org: orgId },
    );
    expect(error).toBeNull();
    const owner = members?.find((m) => m.user_id === ids.owner);
    expect(owner?.role).toBe("owner");
    expect(owner?.email).toBe(emails.owner);
    expect(Object.keys(owner ?? {})).not.toContain("phone");
    expect(members?.find((m) => m.user_id === ids.invitee)?.is_you).toBe(true);

    const outsider = await clients.outsider.rpc("workspace_members", {
      _org: orgId,
    });
    expect(outsider.error?.message).toBe("not_a_member");
  });

  it("a member can't promote themselves or add memberships", async () => {
    const promote = await clients.invitee
      .from("memberships")
      .update({ role: "owner" })
      .eq("org_id", orgId)
      .eq("user_id", ids.invitee)
      .select();
    expect(promote.data ?? []).toHaveLength(0);
    const add = await clients.invitee
      .from("memberships")
      .insert({ org_id: orgId, user_id: ids.outsider, role: "member" });
    expect(add.error).not.toBeNull();
  });

  it("a member records their own onboarding progress", async () => {
    const saved = await clients.invitee.rpc("save_onboarding_progress", {
      _org_id: orgId,
      _step: "updates",
      _done: "profile",
    });
    expect(saved.error).toBeNull();
    const { data } = await clients.invitee
      .from("memberships")
      .select("onboarding_step, onboarding_done")
      .eq("org_id", orgId)
      .eq("user_id", ids.invitee)
      .single();
    expect(data?.onboarding_step).toBe("updates");
    expect(data?.onboarding_done).toEqual(["profile"]);
  });
});

describe("join_workspace_by_link", () => {
  it("honours the enabled flag and allowed domains, then joins as member", async () => {
    const link = token();
    await admin
      .from("organizations")
      .update({
        join_token_hash: sha256(link),
        join_link_enabled: false,
        allowed_domains: ["acme.test"],
      })
      .eq("id", orgId);

    const disabled = await clients.joiner.rpc("join_workspace_by_link", {
      _token: link,
    });
    expect(disabled.error?.message).toBe("join_link_disabled");

    await admin
      .from("organizations")
      .update({ join_link_enabled: true })
      .eq("id", orgId);

    const wrongDomain = await clients.outsider.rpc("join_workspace_by_link", {
      _token: link,
    });
    expect(wrongDomain.error?.message).toBe("join_domain_not_allowed");

    const bogus = await clients.joiner.rpc("join_workspace_by_link", {
      _token: token(),
    });
    expect(bogus.error?.message).toBe("join_link_invalid");

    const joined = await clients.joiner.rpc("join_workspace_by_link", {
      _token: link,
    });
    expect(joined.error).toBeNull();
    const { data } = await clients.joiner
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", ids.joiner)
      .single();
    expect(data?.role).toBe("member");
  });
});

describe("ownership guard", () => {
  it("the last owner can't leave or be demoted", async () => {
    const leave = await clients.owner
      .from("memberships")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", ids.owner);
    expect(leave.error?.message).toBe("last_owner");
    const demote = await clients.owner
      .from("memberships")
      .update({ role: "admin" })
      .eq("org_id", orgId)
      .eq("user_id", ids.owner);
    expect(demote.error?.message).toBe("last_owner");
  });
});

describe("invitations: create, preview, resend, accept by id", () => {
  const anon = () => createClient<Database>(SUPABASE_URL, ANON_KEY, noPersist);

  it("create_invitations dedupes, skips members and invalid addresses, and is admin-only", async () => {
    const { data, error } = await clients.owner.rpc("create_invitations", {
      _org: orgId,
      _emails: [
        `New-${stamp}@acme.test`,
        ` new-${stamp}@acme.test `,
        "not-an-email",
        emails.invitee,
      ],
      _role: "member",
      _expires_days: 7,
    });
    expect(error).toBeNull();
    const byEmail = Object.fromEntries(
      (data ?? []).map((r) => [r.invite_email, r]),
    );
    expect(Object.keys(byEmail)).toHaveLength(3);
    expect(byEmail[`new-${stamp}@acme.test`]?.result).toBe("invited");
    expect(byEmail[`new-${stamp}@acme.test`]?.invite_token).toHaveLength(43);
    expect(byEmail["not-an-email"]?.result).toBe("invalid");
    expect(byEmail[emails.invitee]?.result).toBe("already_member");

    const stored = await admin
      .from("invitations")
      .select("token_hash")
      .eq("email", `new-${stamp}@acme.test`)
      .single();
    const token = byEmail[`new-${stamp}@acme.test`]?.invite_token ?? "";
    expect(stored.data?.token_hash).toBe(sha256(token));

    const asMember = await clients.joiner.rpc("create_invitations", {
      _org: orgId,
      _emails: [`x-${stamp}@acme.test`],
    });
    expect(asMember.error?.message).toBe("not_allowed");
    const asOutsider = await clients.outsider.rpc("create_invitations", {
      _org: orgId,
      _emails: [`y-${stamp}@acme.test`],
    });
    expect(asOutsider.error?.message).toBe("not_allowed");
    const ownerRole = await clients.owner.rpc("create_invitations", {
      _org: orgId,
      _emails: [`z-${stamp}@acme.test`],
      _role: "owner",
    });
    expect(ownerRole.error?.message).toBe("invalid_role");
  });

  it("invitation_preview works signed out and never exposes hashes", async () => {
    const created = await clients.owner.rpc("create_invitations", {
      _org: orgId,
      _emails: [`preview-${stamp}@acme.test`],
    });
    const inviteToken = created.data?.[0]?.invite_token ?? "";
    const { data, error } = await anon().rpc("invitation_preview", {
      _token: inviteToken,
    });
    expect(error).toBeNull();
    expect(data?.[0]?.status).toBe("valid");
    expect(data?.[0]?.org_slug).toBe(slug);
    expect(data?.[0]?.email).toBe(`preview-${stamp}@acme.test`);
    expect(JSON.stringify(data)).not.toMatch(/hash/i);

    const unknown = await anon().rpc("invitation_preview", { _token: token() });
    expect(unknown.data?.[0]?.status).toBe("not_found");
  });

  it("resend_invitation rotates the token: the old link stops working", async () => {
    const created = await clients.owner.rpc("create_invitations", {
      _org: orgId,
      _emails: [`resend-${stamp}@acme.test`],
    });
    const first = created.data?.[0];
    const resent = await clients.owner.rpc("resend_invitation", {
      _invitation_id: first?.invitation_id ?? "",
      _expires_days: 7,
    });
    expect(resent.error).toBeNull();
    const fresh = resent.data?.[0]?.invite_token ?? "";
    expect(fresh).not.toBe(first?.invite_token);
    const oldPreview = await anon().rpc("invitation_preview", {
      _token: first?.invite_token ?? "",
    });
    expect(oldPreview.data?.[0]?.status).toBe("not_found");
    const newPreview = await anon().rpc("invitation_preview", {
      _token: fresh,
    });
    expect(newPreview.data?.[0]?.status).toBe("valid");

    const byMember = await clients.joiner.rpc("resend_invitation", {
      _invitation_id: first?.invitation_id ?? "",
    });
    expect(byMember.error?.message).toBe("invite_not_found");
  });

  it("accept_pending_invitation needs the invited, confirmed email", async () => {
    const created = await clients.owner.rpc("create_invitations", {
      _org: orgId,
      _emails: [emails.outsider],
      _role: "admin",
    });
    const invitationId = created.data?.[0]?.invitation_id ?? "";

    const wrong = await clients.joiner.rpc("accept_pending_invitation", {
      _invitation_id: invitationId,
    });
    expect(wrong.error?.message).toBe("invite_wrong_account");

    const pending = await clients.outsider.rpc("my_pending_invitations");
    expect(pending.data?.some((r) => r.invitation_id === invitationId)).toBe(
      true,
    );

    const accepted = await clients.outsider.rpc("accept_pending_invitation", {
      _invitation_id: invitationId,
    });
    expect(accepted.error).toBeNull();
    const { data: membership } = await clients.outsider
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", ids.outsider)
      .single();
    expect(membership?.role).toBe("admin");

    const again = await clients.outsider.rpc("accept_pending_invitation", {
      _invitation_id: invitationId,
    });
    expect(again.error?.message).toBe("invite_used");
  });
});

describe("invite links: reset, preview, domain rules", () => {
  it("owners/admins rotate the link; members can't; free mail is refused", async () => {
    const reset = await clients.owner.rpc("reset_join_link", { _org: orgId });
    expect(reset.error).toBeNull();
    expect(reset.data).toHaveLength(43);

    const preview = await createClient<Database>(
      SUPABASE_URL,
      ANON_KEY,
      noPersist,
    ).rpc("join_link_preview", { _token: reset.data ?? "" });
    expect(preview.data?.[0]?.status).toBe("valid");
    expect(preview.data?.[0]?.org_slug).toBe(slug);

    const byMember = await clients.joiner.rpc("reset_join_link", {
      _org: orgId,
    });
    expect(byMember.error?.message).toBe("not_allowed");

    const freeMail = await clients.owner.rpc("set_join_link", {
      _org: orgId,
      _enabled: true,
      _allowed_domains: ["gmail.com"],
    });
    expect(freeMail.error?.message).toBe("free_mail_domain");

    const off = await clients.owner.rpc("set_join_link", {
      _org: orgId,
      _enabled: false,
      _allowed_domains: ["Acme.test"],
    });
    expect(off.error).toBeNull();
    const { data: org } = await admin
      .from("organizations")
      .select("join_link_enabled, allowed_domains")
      .eq("id", orgId)
      .single();
    expect(org?.join_link_enabled).toBe(false);
    expect(org?.allowed_domains).toEqual(["acme.test"]);
  });
});

describe("roles and account deletion", () => {
  it("admins can't grant the owner role; owners can manage admins", async () => {
    // The outsider joined above as an admin.
    const selfPromote = await clients.outsider
      .from("memberships")
      .update({ role: "owner" })
      .eq("org_id", orgId)
      .eq("user_id", ids.outsider);
    expect(selfPromote.error?.message).toBe("owners_only");

    const promote = await clients.owner
      .from("memberships")
      .update({ role: "admin" })
      .eq("org_id", orgId)
      .eq("user_id", ids.invitee)
      .select("role");
    expect(promote.error).toBeNull();
    expect(promote.data?.[0]?.role).toBe("admin");
  });

  it("a sole owner of a workspace with members can't be deleted", async () => {
    const { data: blocking } = await clients.owner.rpc(
      "my_blocking_workspaces",
    );
    expect(blocking?.map((b) => b.org_id)).toContain(orgId);

    const { error } = await admin.auth.admin.deleteUser(ids.owner);
    expect(error).not.toBeNull();
    const { data: still } = await admin
      .from("profiles")
      .select("id")
      .eq("id", ids.owner)
      .maybeSingle();
    expect(still?.id).toBe(ids.owner);
  });
});
