// Slice P4.1: the Library Operator signs in with an emailed code (PLAN.md 3).
// The database checks HOW someone signed in, not just who they are:
// - the Library Operator gets in with an emailed code, and only that way;
// - an admin can never use an emailed code instead of their password and
//   authenticator app (not even emailed code + authenticator);
// - a switched-off operator gets nothing, even with a genuine code.
// No email is sent: the tests ask Supabase for the code with the master key.
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, authenticatorClient, emailCodeClient, masterKeyClient, passwordOnlyClient, signedOutClient, userIdOf } from "./clients";

const operator = seedAdmin("library_operator");
const formerOperator = seedAdmin("library_operator", false);
const ADMIN_ROLES = ["super_admin", "centre_admin", "finance"] as const;

// Everything outside the library: the operator must read none of it.
const OUTSIDE_THE_LIBRARY = [
  "locations",
  "audit_log",
  "items",
  "labels",
  "stock_movements",
  "asset_events",
  "people",
  "policies",
  "vehicles",
  "maintenance_tickets",
  "rota_weeks",
];

async function myRole(client: Awaited<ReturnType<typeof asRole>>) {
  const { data } = await client.from("app_users").select("id, role, active");
  return data ?? [];
}

describe("Library Operator signed in with an emailed code", () => {
  it("is let in: reads their own account, and only their own", async () => {
    const rows = await myRole(await asRole("library_operator"));
    expect(rows).toEqual([{ id: userIdOf(operator.email), role: "library_operator", active: true }]);
  });

  it("the sign-in pass says it was an emailed code, not a password", async () => {
    const { data } = await (await asRole("library_operator")).auth.getClaims();
    expect(data?.claims.aal).toBe("aal1");
    expect((data?.claims.amr as { method: string }[]).map((a) => a.method)).toEqual(["otp"]);
  });

  it("reads the list of role names (the top bar shows their role)", async () => {
    const { data } = await (await asRole("library_operator")).from("roles").select("code");
    expect(data!.map((r) => r.code).sort()).toEqual(["centre_admin", "finance", "library_operator", "super_admin"]);
  });

  for (const table of OUTSIDE_THE_LIBRARY) {
    it(`still cannot read ${table}`, async () => {
      const { data } = await (await asRole("library_operator")).from(table).select("*").limit(5);
      expect(data ?? []).toHaveLength(0);
    });
  }

  it("cannot see the Home counters", async () => {
    const { data, error } = await (await asRole("library_operator")).rpc("home_counters");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("cannot change their own account (name, role or switch)", async () => {
    const c = await asRole("library_operator");
    for (const change of [{ display_name: "Test Changed" }, { role: "super_admin" }, { active: false }]) {
      const { data } = await c.from("app_users").update(change).eq("id", userIdOf(operator.email)).select();
      expect(data ?? [], JSON.stringify(change)).toHaveLength(0);
    }
    const { data: still } = await masterKeyClient()
      .from("app_users")
      .select("display_name, role, active")
      .eq("id", userIdOf(operator.email))
      .single();
    expect(still).toEqual({ display_name: operator.displayName, role: "library_operator", active: true });
  });

  it("cannot add an account", async () => {
    const { error } = await (await asRole("library_operator"))
      .from("app_users")
      .insert({ id: userIdOf(formerOperator.email), display_name: "Test Intruder", role: "super_admin" });
    expect(error).not.toBeNull();
  });
});

describe("Library Operator signed in any other way", () => {
  it("password only: nothing", async () => {
    expect(await myRole(await passwordOnlyClient(operator.email))).toHaveLength(0);
  });

  it("password and authenticator app: nothing (that is the admins' way, not theirs)", async () => {
    expect(await myRole(await authenticatorClient(operator.email))).toHaveLength(0);
  });
});

describe("a switched-off Library Operator", () => {
  it("gets nothing, even with a genuine emailed code", async () => {
    const c = await asRole("library_operator", false);
    expect(await myRole(c)).toHaveLength(0);
    for (const table of ["roles", "locations", "items"]) {
      const { data } = await c.from(table).select("*").limit(5);
      expect(data ?? [], table).toHaveLength(0);
    }
  });
});

describe("admins cannot use an emailed code instead of password and authenticator", () => {
  for (const role of ADMIN_ROLES) {
    it(`${role} with an emailed code: nothing`, async () => {
      const c = await emailCodeClient(seedAdmin(role).email);
      expect(await myRole(c)).toHaveLength(0);
      const { data } = await c.from("roles").select("code");
      expect(data ?? []).toHaveLength(0);
    });
  }

  it("an emailed code plus the authenticator app (no password) is still refused", async () => {
    const admin = seedAdmin("super_admin");
    const c = await emailCodeClient(admin.email);
    const { data: factors } = await c.auth.mfa.listFactors();
    const { testAuthenticatorSecret } = await import("../../scripts/test-authenticators.mts");
    const { totp } = await import("../../scripts/totp.mts");
    const verified = await c.auth.mfa.challengeAndVerify({ factorId: factors!.totp[0].id, code: totp(testAuthenticatorSecret(admin.email)) });
    // Supabase may refuse a code another test used a moment ago; either way
    // this sign-in must not reach anything.
    if (!verified.error) {
      const { data } = await c.auth.getClaims();
      expect(data?.claims.aal).toBe("aal2");
    }
    expect(await myRole(c)).toHaveLength(0);
    const { data } = await c.from("audit_log").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
  });

  it("the normal way still works: password and authenticator", async () => {
    const rows = await myRole(await asRole("super_admin"));
    expect(rows.length).toBeGreaterThan(1);
  });
});

describe("the emailed-code rule itself", () => {
  it("a signed-out visitor still reads nothing", async () => {
    const { data } = await signedOutClient().from("app_users").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
  });

  it("nobody can switch an admin role to emailed codes", async () => {
    for (const role of ["super_admin", "centre_admin", "library_operator"] as const) {
      const { data } = await (await asRole(role))
        .from("roles")
        .update({ sign_in_method: "email_code" })
        .eq("code", "finance")
        .select();
      expect(data ?? [], role).toHaveLength(0);
    }
    const { data } = await masterKeyClient().from("roles").select("sign_in_method").eq("code", "finance").single();
    expect(data?.sign_in_method).toBe("authenticator");
  });
});
