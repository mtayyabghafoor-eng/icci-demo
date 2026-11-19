// Accounts and roles: who can see and change sign-in accounts.
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, signedOutClient, userIdOf } from "./clients";

const superAdmin = seedAdmin("super_admin");
const secondAdmin = SEED_ADMINS.find((a) => a.email.startsWith("second."))!;
const deactivated = seedAdmin("centre_admin", false);
// The library operator is blocked until Phase 4 (see two-factor.test.ts).
const activeAccounts = SEED_ADMINS.filter((a) => a.active && a.role !== "library_operator");

describe("signed-out visitor", () => {
  it("cannot read accounts or roles", async () => {
    const c = signedOutClient();
    const users = await c.from("app_users").select("*");
    const roles = await c.from("roles").select("*");
    expect(users.data ?? []).toHaveLength(0);
    expect(roles.data ?? []).toHaveLength(0);
  });

  it("cannot create an account", async () => {
    const { error } = await signedOutClient()
      .from("app_users")
      .insert({ id: userIdOf(superAdmin.email), display_name: "Test Intruder", role: "super_admin" });
    expect(error).not.toBeNull();
  });
});

describe("reading accounts", () => {
  for (const person of activeAccounts) {
    it(`${person.displayName} can read their own account and role`, async () => {
      const c = await asRole(person.role);
      const { data } = await c.from("app_users").select("id, role, active").eq("id", userIdOf(person.email));
      expect(data).toEqual([{ id: userIdOf(person.email), role: person.role, active: true }]);
    });
  }

  for (const role of ["super_admin", "centre_admin", "finance"]) {
    it(`${role} can see every account's name (needed to show who did what)`, async () => {
      const { data } = await (await asRole(role)).from("app_users").select("id");
      expect(data!.length).toBeGreaterThanOrEqual(SEED_ADMINS.length);
    });
  }

  it("library_operator sees only their own account (emailed-code sign-in, P4.1)", async () => {
    const { data } = await (await asRole("library_operator")).from("app_users").select("id");
    expect(data).toEqual([{ id: userIdOf(seedAdmin("library_operator").email) }]);
  });

  it("a deactivated account cannot see any accounts, not even its own", async () => {
    const { data } = await (await asRole("centre_admin", false)).from("app_users").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("an active account can read the list of roles", async () => {
    const { data } = await (await asRole("finance")).from("roles").select("code");
    expect(data!.map((r) => r.code).sort()).toEqual(["centre_admin", "finance", "library_operator", "super_admin"]);
  });
});

describe("changing accounts", () => {
  for (const role of ["centre_admin", "finance", "library_operator"]) {
    it(`${role} cannot change someone else's account`, async () => {
      const target = role === "centre_admin" ? secondAdmin : seedAdmin("centre_admin");
      const { data } = await (await asRole(role))
        .from("app_users")
        .update({ role: "super_admin" })
        .eq("id", userIdOf(target.email))
        .select();
      expect(data ?? []).toHaveLength(0);
      const check = await (await asRole("super_admin")).from("app_users").select("role").eq("id", userIdOf(target.email));
      expect(check.data![0].role).toBe(target.role);
    });

    it(`${role} cannot give themselves a different role`, async () => {
      const me = seedAdmin(role);
      const { data } = await (await asRole(role))
        .from("app_users")
        .update({ role: "super_admin" })
        .eq("id", userIdOf(me.email))
        .select();
      expect(data ?? []).toHaveLength(0);
    });
  }

  it("centre_admin cannot create a role", async () => {
    const { error } = await (await asRole("centre_admin")).from("roles").insert({ code: "test_role", label: "Test role" });
    expect(error).not.toBeNull();
  });

  it("super_admin can rename another account", async () => {
    const { data, error } = await (await asRole("super_admin"))
      .from("app_users")
      .update({ display_name: secondAdmin.displayName })
      .eq("id", userIdOf(secondAdmin.email))
      .select("display_name");
    expect(error).toBeNull();
    expect(data).toEqual([{ display_name: secondAdmin.displayName }]);
  });

  it("super_admin can switch an account on and off", async () => {
    const c = await asRole("super_admin");
    const id = userIdOf(deactivated.email);
    try {
      const on = await c.from("app_users").update({ active: true }).eq("id", id).select("active");
      expect(on.data).toEqual([{ active: true }]);
    } finally {
      const off = await c.from("app_users").update({ active: false }).eq("id", id).select("active");
      expect(off.data).toEqual([{ active: false }]);
    }
  });

  it("super_admin cannot change their own role (prevents locking everyone out)", async () => {
    const { error } = await (await asRole("super_admin"))
      .from("app_users")
      .update({ role: "centre_admin" })
      .eq("id", userIdOf(superAdmin.email));
    expect(error?.message).toMatch(/own role/i);
  });

  it("super_admin cannot deactivate their own account", async () => {
    const { error } = await (await asRole("super_admin"))
      .from("app_users")
      .update({ active: false })
      .eq("id", userIdOf(superAdmin.email));
    expect(error?.message).toMatch(/own account/i);
  });
});

// Audit fix 5 (15 Nov 2026): switching off a built-in role, or changing how
// it signs in, would lock out everyone who has it.
describe("the built-in roles are protected", () => {
  const builtIn = ["super_admin", "centre_admin", "finance", "library_operator"];

  async function rolesNow() {
    const { data, error } = await masterKeyClient().from("roles").select("code, active, sign_in_method").in("code", builtIn).order("code");
    if (error) throw error;
    return data;
  }

  it("super_admin cannot switch one off or change how it signs in", async () => {
    const before = await rolesNow();
    const c = await asRole("super_admin");
    for (const code of builtIn) {
      const off = await c.from("roles").update({ active: false }).eq("code", code);
      expect(off.error?.message, code).toMatch(/built-in role/i);
      const method = code === "library_operator" ? "authenticator" : "email_code";
      const weaker = await c.from("roles").update({ sign_in_method: method }).eq("code", code);
      expect(weaker.error?.message, code).toMatch(/built-in role/i);
    }
    expect(await rolesNow()).toEqual(before);
  });

  it("even the master key cannot (only a numbered database update can)", async () => {
    const before = await rolesNow();
    const m = masterKeyClient();
    expect((await m.from("roles").update({ active: false }).eq("code", "super_admin")).error?.message).toMatch(/built-in role/i);
    expect((await m.from("roles").update({ sign_in_method: "email_code" }).eq("code", "centre_admin")).error?.message).toMatch(
      /built-in role/i,
    );
    expect(await rolesNow()).toEqual(before);
  });

  it("their wording can still be changed by a super_admin", async () => {
    const c = await asRole("super_admin");
    const { data: role } = await c.from("roles").select("description").eq("code", "finance").single();
    const changed = await c.from("roles").update({ description: `${role!.description} ` }).eq("code", "finance").select("description");
    expect(changed.error).toBeNull();
    const back = await c.from("roles").update({ description: role!.description }).eq("code", "finance");
    expect(back.error).toBeNull();
  });
});
