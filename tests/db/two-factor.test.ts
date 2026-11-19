// Slice 3: the database itself insists on the authenticator code.
// A stolen password alone must get nobody anywhere.
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, authenticatorClient, masterKeyClient, passwordOnlyClient, signedOutClient, testName, userIdOf } from "./clients";

const TABLES = ["app_users", "roles", "locations", "audit_log"];
const ADMIN_ROLES = ["super_admin", "centre_admin", "finance"];

describe("signed in with the password only (no authenticator code yet)", () => {
  for (const person of SEED_ADMINS.filter((a) => a.active)) {
    it(`${person.displayName} cannot read any table`, async () => {
      const c = await passwordOnlyClient(person.email);
      for (const table of TABLES) {
        const { data } = await c.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
    });

    it(`${person.displayName} cannot add a location`, async () => {
      const { error } = await (await passwordOnlyClient(person.email))
        .from("locations")
        .insert({ name: testName("password-only"), kind: "building" });
      expect(error).not.toBeNull();
    });

    it(`${person.displayName} cannot change an account`, async () => {
      const { data } = await (await passwordOnlyClient(person.email))
        .from("app_users")
        .update({ display_name: "Test Changed" })
        .eq("id", userIdOf(person.email))
        .select();
      expect(data ?? []).toHaveLength(0);
    });
  }

  it("cannot add a second authenticator (a stolen password cannot add a new phone)", async () => {
    // A brand-new password-only sign-in: the shared one above was later
    // upgraded with the code, so Supabase would treat it as fully signed in.
    const c = signedOutClient();
    const signIn = await c.auth.signInWithPassword({
      email: seedAdmin("finance").email,
      password: process.env.TEST_USER_PASSWORD!,
    });
    expect(signIn.error).toBeNull();
    const { data, error } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: testName("intruder phone") });
    expect(error?.message).toMatch(/AAL2 required/i);
    expect(data).toBeNull();
  });
});

describe("signed in with password and authenticator code", () => {
  for (const role of ADMIN_ROLES) {
    it(`${role} can read their own account`, async () => {
      const me = seedAdmin(role);
      const { data } = await (await asRole(role)).from("app_users").select("id").eq("id", userIdOf(me.email));
      expect(data).toHaveLength(1);
    });
  }

  it("a deactivated account still cannot read anything", async () => {
    const c = await asRole("centre_admin", false);
    for (const table of TABLES) {
      const { data } = await c.from(table).select("*").limit(5);
      expect(data ?? [], table).toHaveLength(0);
    }
  });

  it("the library operator signed in with password and authenticator gets nothing (emailed code only, P4.1)", async () => {
    const c = await authenticatorClient(seedAdmin("library_operator").email);
    for (const table of TABLES) {
      const { data } = await c.from(table).select("*").limit(5);
      expect(data ?? [], table).toHaveLength(0);
    }
  });
});

describe("how each role signs in", () => {
  it("is recorded on the role: authenticator app for admins, emailed code for the library", async () => {
    const { data, error } = await masterKeyClient().from("roles").select("code, sign_in_method").order("code");
    expect(error).toBeNull();
    expect(data).toEqual([
      { code: "centre_admin", sign_in_method: "authenticator" },
      { code: "finance", sign_in_method: "authenticator" },
      { code: "library_operator", sign_in_method: "email_code" },
      { code: "super_admin", sign_in_method: "authenticator" },
    ]);
  });

  it("cannot be weakened by a centre_admin", async () => {
    const { data } = await (await asRole("centre_admin"))
      .from("roles")
      .update({ sign_in_method: "email_code" })
      .eq("code", "centre_admin")
      .select();
    expect(data ?? []).toHaveLength(0);
  });

  it("only allows the two known methods", async () => {
    const { error } = await masterKeyClient()
      .from("roles")
      .update({ sign_in_method: "password_only" })
      .eq("code", "finance");
    expect(error).not.toBeNull();
  });
});

describe("public sign-up", () => {
  it("is switched off: nobody can create their own account", async () => {
    const { data, error } = await signedOutClient().auth.signUp({
      email: `test-run-${Date.now()}@icci-prototype.test`,
      password: `Test-${Math.random().toString(36)}-Aa1!`,
    });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});
