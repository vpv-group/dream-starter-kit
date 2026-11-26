/**
 * staff_workspaces — the list behind the header workspace switcher
 * (supabase/migrations/20261126120000_staff_workspaces.sql,
 * docs/WORKSPACES.md → Staff workspace view).
 *
 * Staff see every workspace (id, name, slug, logo, member count) and can
 * search or fetch by id; members, anonymous users and the anon role are
 * refused. Same env as rls.test.ts (pnpm test:rls).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  admin,
  anonClient,
  anonymousUser,
  createUser,
  signIn,
  testEmail,
} from "./helpers";

const staffEmail = testEmail("sw-staff");
const memberEmail = testEmail("sw-member");
const users: string[] = [];
const orgs: string[] = [];
const stamp = Date.now();

beforeAll(async () => {
  const staffId = await createUser(staffEmail);
  const memberId = await createUser(memberEmail);
  users.push(staffId, memberId);
  const { error } = await admin
    .from("profiles")
    .update({ is_staff: true })
    .eq("id", staffId);
  if (error) throw error;

  // The member owns one workspace; a second one belongs to nobody they know.
  const member = await signIn(memberEmail);
  const created = await member.rpc("create_workspace", {
    _name: `Switcher Co ${stamp}`,
    _slug: `switcher-co-${stamp}`,
  });
  if (created.error) throw created.error;
  orgs.push(created.data.id);
  const other = await admin
    .from("organizations")
    .insert({
      name: `Hidden Org ${stamp}`,
      owner_id: staffId,
      slug: `hidden-org-${stamp}`,
    })
    .select("id")
    .single();
  if (other.error) throw other.error;
  orgs.push(other.data.id);
});

afterAll(async () => {
  if (orgs.length) await admin.from("organizations").delete().in("id", orgs);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("staff_workspaces", () => {
  it("lists every workspace for staff, searchable and by id", async () => {
    const staff = await signIn(staffEmail);
    const search = await staff.rpc("staff_workspaces", {
      _q: `${stamp}`,
      _limit: 50,
    });
    expect(search.error).toBeNull();
    const names = (search.data ?? []).map((r) => r.name).sort();
    expect(names).toEqual([`Hidden Org ${stamp}`, `Switcher Co ${stamp}`]);
    const memberOrg = search.data?.find((r) => r.id === orgs[0]);
    expect(memberOrg?.member_count).toBe(1);
    expect(memberOrg?.slug).toBe(`switcher-co-${stamp}`);

    const byId = await staff.rpc("staff_workspaces", { _ids: [orgs[1] ?? ""] });
    expect(byId.data?.map((r) => r.id)).toEqual([orgs[1]]);
  });

  it("refuses members, anonymous users and the anon role", async () => {
    const member = await signIn(memberEmail);
    const asMember = await member.rpc("staff_workspaces", {});
    expect(asMember.error?.code).toBe("42501");

    const anonymous = await anonymousUser();
    const asAnonymous = await anonymous.rpc("staff_workspaces", {});
    expect(asAnonymous.error?.code).toBe("42501");

    const asAnon = await anonClient().rpc("staff_workspaces", {});
    expect(asAnon.data ?? null).toBeNull();
    expect(asAnon.error).not.toBeNull();
  });
});
