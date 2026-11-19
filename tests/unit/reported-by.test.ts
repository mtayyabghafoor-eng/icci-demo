// Phase 2, slice P2.2: the plain rules for "reported by" (a person from the
// directory, or a typed name), how it is shown, the admin-account link
// choices, the seed links, and the screenshot helper's retry.
// The database enforces the same rules itself: see tests/db/reported-by.test.ts.
import { describe, expect, it } from "vitest";
import { parseAssetForm, reporterOf, type AssetEventRow } from "@/lib/assets/rules";
import { accountChoices } from "@/lib/people/rules";
import { SEED_ADMINS, SEED_PEOPLE } from "../../scripts/seed-data.mts";
import { isFileLock, withFileLockRetry } from "../e2e/retry";

const PERSON = "44444444-4444-4444-4444-444444444444";
const form = (values: Record<string, string>) => (k: string) => values[k] ?? "";

describe("the 'reported by' box on the asset forms", () => {
  it("a person picked from the list is sent as that person, and any typed name is ignored", () => {
    expect(parseAssetForm(form({ note: "Leg loose", reported_by_person_id: PERSON, reported_by: "ignored" }), "damage")).toEqual({
      ok: true,
      values: { kind: "damage", note: "Leg loose", reported_by_person_id: PERSON },
    });
  });
  it("'Someone else' needs a typed name", () => {
    expect(parseAssetForm(form({ note: "Leg loose", reported_by_person_id: "other", reported_by: " A visitor (fictional) " }), "damage")).toEqual({
      ok: true,
      values: { kind: "damage", note: "Leg loose", reported_by: "A visitor (fictional)" },
    });
    expect(parseAssetForm(form({ note: "Leg loose", reported_by_person_id: "other" }), "damage")).toEqual({
      ok: false,
      error: "Type the name of who reported it.",
    });
  });
  it("nothing picked and nothing typed is refused", () => {
    expect(parseAssetForm(form({ note: "Leg loose" }), "damage")).toEqual({ ok: false, error: "Say who reported it." });
  });
  it("a value that is not a person from the list is refused", () => {
    expect(parseAssetForm(form({ note: "Leg loose", reported_by_person_id: "not-an-id" }), "damage")).toEqual({
      ok: false,
      error: "Pick a person from the list, or choose 'Someone else'.",
    });
  });
});

describe("how 'reported by' is shown", () => {
  const ev = (over: Partial<AssetEventRow>) => ({ reported_by: null, reported_by_person_id: null, ...over }) as AssetEventRow;
  const names = new Map([[PERSON, "Test Amina Sample"]]);
  it("a person: their name, with a link to their page", () => {
    expect(reporterOf(ev({ reported_by_person_id: PERSON }), names)).toEqual({ name: "Test Amina Sample", personId: PERSON });
  });
  it("a typed name: as typed, no link", () => {
    expect(reporterOf(ev({ reported_by: "A visitor (fictional)" }), names)).toEqual({ name: "A visitor (fictional)", personId: null });
  });
  it("a person whose name could not be loaded still shows something", () => {
    expect(reporterOf(ev({ reported_by_person_id: "55555555-5555-5555-5555-555555555555" }), names).name).toBe("A person in the directory");
  });
});

describe("the admin-account choices on a person page (Super Admin only)", () => {
  const accounts = [
    { id: "me", display_name: "Test Super Admin", role: "super_admin", active: true },
    { id: "fin", display_name: "Test Finance Officer", role: "finance", active: true },
    { id: "cen", display_name: "Test Centre Admin", role: "centre_admin", active: true },
    { id: "off", display_name: "Test Deactivated Admin", role: "centre_admin", active: false },
  ];
  const linked = new Map([["cen", "Test Centre Admin (person)"]]);
  it("your own account and accounts already linked to someone else cannot be picked, and say why", () => {
    const c = accountChoices(accounts, linked, "me");
    expect(c.find((a) => a.id === "me")).toMatchObject({ disabled: true, note: "your own account" });
    expect(c.find((a) => a.id === "cen")).toMatchObject({ disabled: true, note: "linked to Test Centre Admin (person)" });
    expect(c.find((a) => a.id === "fin")).toMatchObject({ disabled: false });
    expect(c.find((a) => a.id === "off")).toMatchObject({ disabled: false, note: "switched off" });
  });
});

describe("seed links (made-up)", () => {
  it("Test Centre Admin and Test Second Admin each have a person record linked to their account", () => {
    const linked = SEED_PEOPLE.filter((p) => p.account);
    expect(linked.map((p) => p.account).sort()).toEqual(
      SEED_ADMINS.filter((a) => a.role === "centre_admin" && a.active).map((a) => a.email).sort(),
    );
    for (const p of linked) expect(p.full_name).toBe(SEED_ADMINS.find((a) => a.email === p.account)!.displayName);
  });
  it("the Super Admin is not linked, so a Super Admin is left to link the others", () => {
    expect(SEED_PEOPLE.some((p) => p.account?.startsWith("super.admin"))).toBe(false);
  });
});

describe("the screenshot helper tries again when Windows briefly locks the file", () => {
  const lock = Object.assign(new Error("UNKNOWN: unknown error, open 'docs/screens/x.png'"), { code: "UNKNOWN" });
  it("recognises a file lock, and nothing else", () => {
    expect(isFileLock(lock)).toBe(true);
    expect(isFileLock(Object.assign(new Error("EBUSY: resource busy"), { code: "EBUSY" }))).toBe(true);
    expect(isFileLock(new Error("Target page, context or browser has been closed"))).toBe(false);
  });
  it("succeeds on the third try", async () => {
    let tries = 0;
    const result = await withFileLockRetry(async () => {
      if (++tries < 3) throw lock;
      return "saved";
    }, 0);
    expect(result).toBe("saved");
    expect(tries).toBe(3);
  });
  it("gives up after three tries, with the real error", async () => {
    let tries = 0;
    await expect(
      withFileLockRetry(async () => {
        tries++;
        throw lock;
      }, 0),
    ).rejects.toThrow(/UNKNOWN/);
    expect(tries).toBe(3);
  });
  it("does not retry other errors", async () => {
    let tries = 0;
    await expect(
      withFileLockRetry(async () => {
        tries++;
        throw new Error("page closed");
      }, 0),
    ).rejects.toThrow("page closed");
    expect(tries).toBe(1);
  });
});
