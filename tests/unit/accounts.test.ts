// Round C5: the accounts screen's plain rules and the first sign-in's last step.
import { describe, expect, it } from "vitest";
import { accountState, friendlyAccountError, parseNewAccount, temporaryPassword } from "@/lib/accounts/rules";
import { decideRoute, NEW_PASSWORD_PATH } from "@/lib/auth/rules";
import { meetsPasswordRule } from "@/lib/auth/password-rule";

const form = (v: Record<string, string>) => (name: string) => v[name] ?? "";

describe("a temporary password", () => {
  it("always meets the password rule, is easy to read, and is never the same twice", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = temporaryPassword();
      expect(meetsPasswordRule(p), p).toBe(true);
      expect(p).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
      expect(p).not.toMatch(/[01OlI]/);
      seen.add(p);
    }
    expect(seen.size).toBe(300);
  });
});

describe("the Add an account form", () => {
  it("takes a name, an email and one of the four roles", () => {
    expect(parseNewAccount(form({ display_name: "  Test  Person ", email: " Test@Example.ORG ", role: "finance" }))).toEqual({
      ok: true,
      values: { display_name: "Test Person", email: "test@example.org", role: "finance" },
    });
  });
  it("refuses an empty name, a bad email and a made-up role", () => {
    expect(parseNewAccount(form({ email: "a@b.org", role: "finance" }))).toMatchObject({ ok: false, error: /name/ });
    expect(parseNewAccount(form({ display_name: "X", email: "not an email", role: "finance" }))).toMatchObject({ ok: false, error: /email/ });
    expect(parseNewAccount(form({ display_name: "X", email: "a@b.org", role: "owner" }))).toMatchObject({ ok: false, error: /role/ });
  });
});

describe("where an account stands", () => {
  const base = { active: true, temporary_password_until: null, has_authenticator: true, sign_in_method: "authenticator" };
  const now = Date.parse("2026-11-26T12:00:00Z");
  it("in words, with a colour", () => {
    expect(accountState(base, now)).toEqual({ word: "Active", tone: "green" });
    expect(accountState({ ...base, active: false }, now).word).toBe("Switched off");
    expect(accountState({ ...base, temporary_password_until: "2026-11-27T10:00:00Z" }, now).word).toBe("Waiting for first sign-in");
    expect(accountState({ ...base, temporary_password_until: "2026-11-26T10:00:00Z" }, now)).toEqual({ word: "Temporary password ran out", tone: "red" });
    expect(accountState({ ...base, has_authenticator: false }, now).word).toBe("Authenticator to set up");
    expect(accountState({ ...base, has_authenticator: false, sign_in_method: "email_code" }, now).word).toBe("Active");
  });
  it("only plain refusals are shown", () => {
    expect(friendlyAccountError("A user with this email address has already been registered")).toBe("That email address already has a sign-in.");
    expect(friendlyAccountError("connection reset by peer")).toBe("That could not be done. Please try again.");
  });
});

describe("the gatekeeper and the choose-your-password page", () => {
  const base = { search: "", lastActive: String(Date.now()), now: Date.now() };
  it("lets someone fully signed in reach it, and nothing else in the sign-in area", () => {
    expect(decideRoute({ ...base, pathname: NEW_PASSWORD_PATH, aal: "aal2" })).toEqual({ kind: "allow" });
    expect(decideRoute({ ...base, pathname: "/sign-in/set-up", aal: "aal2" })).toMatchObject({ kind: "redirect" });
  });
  it("a signed-out visitor is sent to sign in", () => {
    expect(decideRoute({ ...base, pathname: NEW_PASSWORD_PATH, aal: null })).toMatchObject({ kind: "redirect", to: "/sign-in" });
  });
});
