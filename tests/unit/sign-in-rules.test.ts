// The gatekeeper's decisions: who may see which page, the 15-minute idle
// sign-out, and "send me back to the page I wanted" (only inside this app).
import { describe, expect, it } from "vitest";
import { assuranceOf, decideRoute, IDLE_LIMIT_MS, isIdleExpired, LIBRARY_PENDING_COOKIE, safeNextPath } from "@/lib/auth/rules";

const now = 1_800_000_000_000;
const recent = String(now - 60_000);

describe("safe return address after sign-in", () => {
  it.each([
    ["/items/ICCI-000123", "/items/ICCI-000123"],
    ["/locations?room=2", "/locations?room=2"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example/steal", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
    ["items", "/"],
    ["/sign-in", "/"],
    ["/sign-in/code", "/"],
  ])("%s becomes %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("15-minute idle limit", () => {
  it("is 15 minutes", () => {
    expect(IDLE_LIMIT_MS).toBe(15 * 60 * 1000);
  });

  it("is not reached after 14 minutes 59 seconds", () => {
    expect(isIdleExpired(String(now - IDLE_LIMIT_MS + 1000), now)).toBe(false);
  });

  it("is reached at exactly 15 minutes", () => {
    expect(isIdleExpired(String(now - IDLE_LIMIT_MS), now)).toBe(true);
  });

  it("counts a missing or garbled activity time as idle (fails safe)", () => {
    expect(isIdleExpired(undefined, now)).toBe(true);
    expect(isIdleExpired("not-a-time", now)).toBe(true);
  });

  it("does not trust an activity time far in the future", () => {
    expect(isIdleExpired(String(now + 10 * 60_000), now)).toBe(true);
  });
});

describe("gatekeeper", () => {
  const base = { search: "", now, lastActive: recent };

  it("sends a signed-out visitor to the sign-in page, remembering where they were going", () => {
    expect(decideRoute({ ...base, pathname: "/items/ICCI-000123", aal: null })).toEqual({
      kind: "redirect",
      to: "/sign-in?next=%2Fitems%2FICCI-000123",
      signOut: false,
    });
  });

  it("shows a signed-out visitor the sign-in page itself", () => {
    expect(decideRoute({ ...base, pathname: "/sign-in", aal: null })).toEqual({ kind: "allow" });
  });

  it("does not let a signed-out visitor open the code pages", () => {
    expect(decideRoute({ ...base, pathname: "/sign-in/code", aal: null })).toMatchObject({ to: "/sign-in" });
    expect(decideRoute({ ...base, pathname: "/sign-in/set-up", aal: null })).toMatchObject({ to: "/sign-in" });
  });

  it("sends a password-only sign-in to the code page", () => {
    expect(decideRoute({ ...base, pathname: "/", aal: "aal1" })).toEqual({
      kind: "redirect",
      to: "/sign-in/code?next=%2F",
      signOut: false,
    });
  });

  it("lets a password-only sign-in see the code and set-up pages", () => {
    expect(decideRoute({ ...base, pathname: "/sign-in/code", aal: "aal1" })).toEqual({ kind: "allow" });
    expect(decideRoute({ ...base, pathname: "/sign-in/set-up", aal: "aal1" })).toEqual({ kind: "allow" });
  });

  it("lets a fully signed-in admin through", () => {
    expect(decideRoute({ ...base, pathname: "/", aal: "aal2" })).toEqual({ kind: "allow" });
  });

  it("moves a fully signed-in admin off the sign-in pages to where they were going", () => {
    expect(decideRoute({ ...base, pathname: "/sign-in/code", search: "?next=%2Flocations", aal: "aal2" })).toEqual({
      kind: "redirect",
      to: "/locations",
      signOut: false,
    });
  });

  it("always lets the sign-out page through (it only ever ends a sign-in)", () => {
    for (const aal of [null, "aal1", "aal2"] as const) {
      expect(decideRoute({ ...base, pathname: "/sign-out", search: "?reason=idle", aal })).toEqual({ kind: "allow" });
    }
  });

  it("signs out after 15 minutes idle, even if the page is opened again later", () => {
    const stale = String(now - IDLE_LIMIT_MS - 1);
    for (const aal of ["aal1", "aal2"] as const) {
      expect(decideRoute({ ...base, pathname: "/", aal, lastActive: stale })).toEqual({
        kind: "redirect",
        to: "/sign-in?reason=idle",
        signOut: true,
      });
    }
  });
});

// Slice P4.1: the Library Operator signs in with an emailed code. The
// gatekeeper only knows HOW someone signed in; the database decides whether
// that way is allowed for their role (migration 0034).
describe("how someone signed in, read from the sign-in pass", () => {
  it("not signed in", () => {
    expect(assuranceOf(null)).toBeNull();
    expect(assuranceOf(undefined)).toBeNull();
  });

  it("password and authenticator code", () => {
    expect(assuranceOf({ aal: "aal2", amr: [{ method: "totp" }, { method: "password" }] })).toBe("aal2");
  });

  it("password only", () => {
    expect(assuranceOf({ aal: "aal1", amr: [{ method: "password" }] })).toBe("aal1");
  });

  it("emailed code", () => {
    expect(assuranceOf({ aal: "aal1", amr: [{ method: "otp" }] })).toBe("email_code");
  });

  it("anything unexpected counts as password only (the code page, never further)", () => {
    expect(assuranceOf({ aal: "aal1" })).toBe("aal1");
    expect(assuranceOf({ aal: "aal1", amr: "otp" })).toBe("aal1");
    expect(assuranceOf({ aal: "aal1", amr: [{ method: "magiclink" }] })).toBe("aal1");
  });
});

describe("gatekeeper: library sign-in", () => {
  const base = { search: "", now, lastActive: recent };

  it("lets a signed-out visitor open the library sign-in and its code page", () => {
    expect(decideRoute({ ...base, pathname: "/sign-in/library", aal: null })).toEqual({ kind: "allow" });
    expect(decideRoute({ ...base, pathname: "/sign-in/library/code", aal: null })).toEqual({ kind: "allow" });
  });

  it("still keeps a signed-out visitor off the authenticator pages", () => {
    expect(decideRoute({ ...base, pathname: "/sign-in/code", aal: null })).toMatchObject({ to: "/sign-in" });
    expect(decideRoute({ ...base, pathname: "/sign-in/library/other", aal: null })).toMatchObject({ to: "/sign-in" });
  });

  it("lets an emailed-code sign-in through (the database decides what it may see)", () => {
    expect(decideRoute({ ...base, pathname: "/", aal: "email_code" })).toEqual({ kind: "allow" });
  });

  it("moves an emailed-code sign-in off the sign-in pages", () => {
    expect(decideRoute({ ...base, pathname: "/sign-in/library/code", search: "?next=%2F", aal: "email_code" })).toEqual({
      kind: "redirect",
      to: "/",
      signOut: false,
    });
  });

  it("signs an emailed-code sign-in out after 15 minutes idle", () => {
    const stale = String(now - IDLE_LIMIT_MS - 1);
    expect(decideRoute({ ...base, pathname: "/", aal: "email_code", lastActive: stale })).toEqual({
      kind: "redirect",
      to: "/sign-in?reason=idle",
      signOut: true,
    });
  });

  it("always lets the sign-out page through", () => {
    expect(decideRoute({ ...base, pathname: "/sign-out", aal: "email_code" })).toEqual({ kind: "allow" });
  });

  it("keeps the waiting email address in its own cookie, never in the address bar", () => {
    expect(LIBRARY_PENDING_COOKIE).toMatch(/^icci_/);
  });
});
