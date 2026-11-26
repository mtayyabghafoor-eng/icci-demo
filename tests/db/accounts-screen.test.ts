// Round C5 (migration 0058): the accounts screen's database rules, written
// before the screen. Owner's choice (26 Nov 2026): the website makes the
// sign-in itself with the master key; everything else is done here, as the
// signed-in Super Admin, under these rules.
//   * Only a signed-in Super Admin manages accounts, never their own.
//   * A new admin account's temporary password works for 24 hours and opens
//     nothing until its owner has set up their authenticator AND chosen
//     their own password.
//   * Every account action is written down and never changed.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { makeTestPassword } from "../../scripts/password-rule.mjs";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { totp } from "../../scripts/totp.mts";
import { asRole, masterKeyClient, signedOutClient, userIdOf } from "./clients";

const made: string[] = [];

/** A brand-new made-up sign-in (as the website makes it with the master key). */
async function newSignIn(withPassword = true) {
  const email = `test-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@icci-prototype.test`;
  const password = makeTestPassword();
  const { data, error } = await masterKeyClient().auth.admin.createUser({ email, email_confirm: true, ...(withPassword ? { password } : {}) });
  if (error) throw error;
  made.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function passwordSignIn(email: string, password: string): Promise<SupabaseClient> {
  const c = signedOutClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

/** Sets up an authenticator on this sign-in and uses it (the session becomes "password + code"). */
async function setUpAuthenticator(c: SupabaseClient) {
  const { data, error } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: `Test ${Math.random()}` });
  if (error) throw error;
  const v = await c.auth.mfa.challengeAndVerify({ factorId: data.id, code: totp(data.totp.secret) });
  if (v.error) throw v.error;
}

async function newAdminAccount(role = "centre_admin") {
  const s = await newSignIn();
  const { error } = await (await asRole("super_admin")).rpc("create_account", { p_account: s.id, p_display_name: `Test run account ${role}`, p_role: role });
  if (error) throw error;
  return s;
}

afterAll(async () => {
  // The made-up accounts are switched off, never deleted.
  if (made.length) await masterKeyClient().from("app_users").update({ active: false }).in("id", made);
});

describe("who may manage accounts", () => {
  it("only a signed-in Super Admin", async () => {
    expect((await (await asRole("super_admin")).rpc("may_manage_accounts")).data).toBe(true);
    for (const role of ["centre_admin", "finance", "library_operator"]) {
      expect((await (await asRole(role)).rpc("may_manage_accounts")).data, role).toBe(false);
    }
    expect((await signedOutClient().rpc("may_manage_accounts")).error).not.toBeNull();
  });

  it("nobody else can create an account, give a temporary password or reset two-factor", async () => {
    const s = await newSignIn();
    for (const role of ["centre_admin", "finance", "library_operator"]) {
      const c = await asRole(role);
      expect((await c.rpc("create_account", { p_account: s.id, p_display_name: "Test run sneaky", p_role: "super_admin" })).error, role).not.toBeNull();
      expect((await c.rpc("note_temporary_password", { p_account: userIdOf(seedAdmin("finance").email) })).error, role).not.toBeNull();
      expect((await c.rpc("note_two_factor_reset", { p_account: userIdOf(seedAdmin("finance").email) })).error, role).not.toBeNull();
    }
    for (const fn of ["create_account", "note_temporary_password", "note_two_factor_reset"]) {
      expect((await signedOutClient().rpc(fn, { p_account: s.id, p_display_name: "x", p_role: "super_admin" })).error, fn).not.toBeNull();
    }
    const { data } = await masterKeyClient().from("app_users").select("id").eq("id", s.id);
    expect(data).toEqual([]);
  });

  it("a Super Admin never does it to their own account", async () => {
    const c = await asRole("super_admin");
    const me = userIdOf(seedAdmin("super_admin").email);
    expect((await c.rpc("note_temporary_password", { p_account: me })).error?.message).toMatch(/your own account/);
    expect((await c.rpc("note_two_factor_reset", { p_account: me })).error?.message).toMatch(/your own account/);
  });

  it("nobody sets or clears the 24-hour flag by hand, not even a Super Admin", async () => {
    const s = await newAdminAccount();
    const c = await asRole("super_admin");
    const cleared = await c.from("app_users").update({ temporary_password_until: null }).eq("id", s.id).select("id");
    expect(cleared.error?.message).toMatch(/only from the accounts screen/);
    const set = await c.from("app_users").update({ temporary_password_until: new Date(Date.now() + 9e9).toISOString() }).eq("id", userIdOf(seedAdmin("finance").email));
    expect(set.error?.message).toMatch(/only from the accounts screen/);
  });
});

describe("a new admin account", () => {
  it("starts with a 24-hour temporary password and is written down", async () => {
    const s = await newAdminAccount("finance");
    const m = masterKeyClient();
    const { data } = await m.from("app_users").select("role, active, temporary_password_until, created_by").eq("id", s.id).single();
    expect(data).toMatchObject({ role: "finance", active: true, created_by: userIdOf(seedAdmin("super_admin").email) });
    const hours = (Date.parse(data!.temporary_password_until!) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    const events = await (await asRole("super_admin")).from("account_events").select("kind").eq("account_id", s.id);
    expect(events.data).toEqual([{ kind: "created" }]);
  });

  it("with the temporary password alone it sees nothing at all", async () => {
    const s = await newAdminAccount();
    const c = await passwordSignIn(s.email, s.password);
    expect((await c.rpc("my_set_up_state")).data).toBe("choose_password");
    expect((await c.from("app_users").select("id")).data ?? []).toEqual([]);
    expect((await c.from("items").select("id").limit(1)).data ?? []).toEqual([]);
  });

  it("even with an authenticator set up, it sees nothing until a new password is chosen", async () => {
    const s = await newAdminAccount();
    const c = await passwordSignIn(s.email, s.password);
    expect((await c.rpc("finish_first_set_up")).error?.message).toMatch(/authenticator first/);
    await setUpAuthenticator(c);
    expect((await c.from("items").select("id").limit(1)).data ?? []).toEqual([]);
    expect((await c.rpc("finish_first_set_up")).error?.message).toMatch(/new password first/);

    const fresh = makeTestPassword();
    expect((await c.auth.updateUser({ password: fresh })).error).toBeNull();
    expect((await c.rpc("finish_first_set_up")).error).toBeNull();
    expect((await c.rpc("my_set_up_state")).data).toBe("ready");
    // Now it works as an ordinary Centre Admin: it reads its own account and the items.
    expect((await c.from("app_users").select("id").eq("id", s.id)).data).toEqual([{ id: s.id }]);
    expect(((await c.from("items").select("id").limit(1)).data ?? []).length).toBe(1);
    const { data: events } = await (await asRole("super_admin")).from("account_events").select("kind").eq("account_id", s.id).order("id");
    expect(events!.map((e) => e.kind)).toEqual(["created", "set_up_finished"]);
  });

  it("after 24 hours the temporary password is refused", async () => {
    const s = await newAdminAccount();
    // The master key (this PC only) moves the time back, to stand for a day passing.
    const back = await masterKeyClient().from("app_users").update({ temporary_password_until: new Date(Date.now() - 60_000).toISOString() }).eq("id", s.id);
    expect(back.error).toBeNull();
    const c = await passwordSignIn(s.email, s.password);
    expect((await c.rpc("my_set_up_state")).data).toBe("expired");
    await setUpAuthenticator(c);
    expect((await c.auth.updateUser({ password: makeTestPassword() })).error).toBeNull();
    expect((await c.rpc("finish_first_set_up")).error?.message).toMatch(/run out/);
  });

  it("the Library Operator gets no password: a code is emailed instead", async () => {
    const s = await newSignIn(false);
    const c = await asRole("super_admin");
    expect((await c.rpc("create_account", { p_account: s.id, p_display_name: "Test run library helper", p_role: "library_operator" })).error).toBeNull();
    const { data } = await masterKeyClient().from("app_users").select("temporary_password_until").eq("id", s.id).single();
    expect(data!.temporary_password_until).toBeNull();
    expect((await c.rpc("note_temporary_password", { p_account: s.id })).error?.message).toMatch(/emailed code/);
    expect((await signedOutClient().rpc("library_code_allowed", { p_email: s.email })).data).toBe(true);
  });

  it("refuses a made-up role, an empty name, a sign-in that does not exist, and a second account for one sign-in", async () => {
    const c = await asRole("super_admin");
    const s = await newSignIn();
    expect((await c.rpc("create_account", { p_account: s.id, p_display_name: "Test run", p_role: "owner" })).error?.message).toMatch(/Choose one of the roles/);
    expect((await c.rpc("create_account", { p_account: s.id, p_display_name: "  ", p_role: "finance" })).error?.message).toMatch(/name/);
    expect((await c.rpc("create_account", { p_account: crypto.randomUUID(), p_display_name: "Test run", p_role: "finance" })).error?.message).toMatch(/does not exist/);
    expect((await c.rpc("create_account", { p_account: s.id, p_display_name: "Test run twice", p_role: "finance" })).error).toBeNull();
    expect((await c.rpc("create_account", { p_account: s.id, p_display_name: "Test run twice", p_role: "finance" })).error?.message).toMatch(/already has an account/);
  });
});

describe("a temporary password for an existing account, and a two-factor reset", () => {
  it("a new temporary password: written down, and the account sees nothing until it chooses its own", async () => {
    const s = await newAdminAccount();
    const m = masterKeyClient();
    // Make it an ordinary account first (as if its set-up was finished long ago).
    await m.from("app_users").update({ temporary_password_until: null }).eq("id", s.id);
    const other = makeTestPassword();
    expect((await m.auth.admin.updateUserById(s.id, { password: other })).error).toBeNull();
    expect((await (await asRole("super_admin")).rpc("note_temporary_password", { p_account: s.id })).error).toBeNull();
    const c = await passwordSignIn(s.email, other);
    expect((await c.rpc("my_set_up_state")).data).toBe("choose_password");
  });

  it("a two-factor reset is written down", async () => {
    const s = await newAdminAccount();
    expect((await (await asRole("super_admin")).rpc("note_two_factor_reset", { p_account: s.id })).error).toBeNull();
    const { data } = await (await asRole("super_admin")).from("account_events").select("kind").eq("account_id", s.id).order("id");
    expect(data!.map((e) => e.kind)).toEqual(["created", "two_factor_reset"]);
  });

  it("switching an account off and on is written down", async () => {
    const s = await newAdminAccount();
    const c = await asRole("super_admin");
    expect((await c.from("app_users").update({ active: false }).eq("id", s.id)).error).toBeNull();
    expect((await c.from("app_users").update({ active: true }).eq("id", s.id)).error).toBeNull();
    const { data } = await c.from("account_events").select("kind").eq("account_id", s.id).order("id");
    expect(data!.map((e) => e.kind)).toEqual(["created", "switched_off", "switched_on"]);
  });
});

describe("the account records and the audit log screen", () => {
  it("only a Super Admin reads them; nobody adds, changes or deletes account records", async () => {
    await newAdminAccount();
    for (const role of ["centre_admin", "finance", "library_operator"]) {
      const c = await asRole(role);
      expect((await c.from("account_events").select("id").limit(1)).data ?? [], role).toEqual([]);
      expect((await c.from("audit_log_list").select("id").limit(1)).data ?? [], role).toEqual([]);
    }
    expect((await signedOutClient().from("account_events").select("id").limit(1)).data ?? []).toEqual([]);
    const s = await asRole("super_admin");
    const { data: rows } = await s.from("account_events").select("id, account_id").limit(1);
    expect(rows).toHaveLength(1);
    expect((await s.from("account_events").insert({ account_id: rows![0].account_id, kind: "created" }).select()).data ?? []).toEqual([]);
    const m = masterKeyClient();
    expect((await m.from("account_events").update({ kind: "switched_on" }).eq("id", rows![0].id)).error?.message).toMatch(/never changed/);
    expect((await m.from("account_events").delete().eq("id", rows![0].id)).error?.message).toMatch(/cannot be deleted/);
    const { data: log } = await s.from("audit_log_list").select("table_name, changed_by_name").limit(3);
    expect(log!.length).toBeGreaterThan(0);
  });
});

describe("the account list and a half-made account", () => {
  it("the list shows each account's email and set-up, to a Super Admin only", async () => {
    const s = await newAdminAccount();
    const { data, error } = await (await asRole("super_admin")).rpc("account_list");
    expect(error).toBeNull();
    const row = (data as { id: string; email: string; has_authenticator: boolean; temporary_password_until: string | null }[]).find((r) => r.id === s.id);
    expect(row).toMatchObject({ email: s.email, has_authenticator: false });
    expect(row!.temporary_password_until).not.toBeNull();
    const seeded = (data as { email: string; has_authenticator: boolean }[]).find((r) => r.email === seedAdmin("centre_admin").email);
    expect(seeded?.has_authenticator).toBe(true);
    for (const role of ["centre_admin", "finance", "library_operator"]) {
      expect((await (await asRole(role)).rpc("account_list")).data ?? [], role).toEqual([]);
    }
    expect((await signedOutClient().rpc("account_list")).error).not.toBeNull();
  });

  it("a sign-in left without an account is found again, by a Super Admin only", async () => {
    const s = await newSignIn();
    expect((await (await asRole("super_admin")).rpc("sign_in_without_account", { p_email: ` ${s.email.toUpperCase()} ` })).data).toBe(s.id);
    expect((await (await asRole("centre_admin")).rpc("sign_in_without_account", { p_email: s.email })).data).toBeNull();
    expect((await (await asRole("super_admin")).rpc("sign_in_without_account", { p_email: seedAdmin("finance").email })).data).toBeNull();
  });
});
