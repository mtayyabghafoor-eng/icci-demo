// Phase 2, slice P2.1: the plain rules behind the people screens (what the
// form accepts, the same-name warning, status words) and the made-up seed
// people. The database enforces the same rules itself: see tests/db/people.test.ts.
import { describe, expect, it } from "vitest";
import { friendlyPeopleError, isEmail, isPhone, parsePersonForm, PERSON_STATUS, sameNameAs } from "@/lib/people/rules";
import { SEED_PEOPLE, SEED_PERSON_ROLES, SEED_SECTIONS } from "../../scripts/seed-data.mts";

const ROLE = "11111111-1111-1111-1111-111111111111";
const SECTION = "22222222-2222-2222-2222-222222222222";
const form = (values: Record<string, string>) => (k: string) => values[k] ?? "";
const good = { full_name: "  Test  Amina   Sample ", person_role_id: ROLE, section_id: SECTION };

describe("the add and edit person form", () => {
  it("tidies spaces in the name and turns empty boxes into 'not recorded'", () => {
    const r = parsePersonForm(form(good));
    expect(r).toEqual({
      ok: true,
      values: { full_name: "Test Amina Sample", person_role_id: ROLE, section_id: SECTION, phone: null, email: null, start_date: null },
    });
  });

  it("needs a name, a role and a section", () => {
    expect(parsePersonForm(form({ ...good, full_name: "  " }))).toMatchObject({ ok: false, error: /name/i });
    expect(parsePersonForm(form({ ...good, person_role_id: "" }))).toMatchObject({ ok: false, error: /role/i });
    expect(parsePersonForm(form({ ...good, section_id: "nonsense" }))).toMatchObject({ ok: false, error: /section/i });
  });

  it("refuses a name over 200 characters", () => {
    expect(parsePersonForm(form({ ...good, full_name: "x".repeat(201) }))).toMatchObject({ ok: false });
  });

  it("checks the phone, email and start date", () => {
    expect(parsePersonForm(form({ ...good, phone: "ring reception" }))).toMatchObject({ ok: false, error: /phone/i });
    expect(parsePersonForm(form({ ...good, email: "nope" }))).toMatchObject({ ok: false, error: /email/i });
    expect(parsePersonForm(form({ ...good, start_date: "2026-13-40" }))).toMatchObject({ ok: false, error: /date/i });
    const r = parsePersonForm(form({ ...good, phone: " +353 00 000 0001 ", email: " Test.Person@Example.TEST ", start_date: "2024-09-01" }));
    expect(r).toMatchObject({ ok: true, values: { phone: "+353 00 000 0001", email: "test.person@example.test", start_date: "2024-09-01" } });
  });
});

describe("phone and email checks", () => {
  it("a phone number has 6 to 20 digits, and may use + spaces brackets and dashes", () => {
    for (const ok of ["+353 00 000 0001", "(01) 000-0000", "0000000"]) expect(isPhone(ok), ok).toBe(true);
    for (const bad of ["12345", "call me", "+353 00 000 0001 ext 4", "1".repeat(21)]) expect(isPhone(bad), bad).toBe(false);
  });
  it("an email address has one @ and a dot after it", () => {
    expect(isEmail("test.person@example.test")).toBe(true);
    for (const bad of ["no-at-sign", "a@b", "a b@c.d", "a@@b.c"]) expect(isEmail(bad), bad).toBe(false);
  });
});

describe("the same-name warning", () => {
  const people = [
    { id: "a", full_name: "Test Amina Sample", active: true },
    { id: "b", full_name: "Test Yusuf Example", active: false },
  ];
  it("finds the same name, ignoring capitals and extra spaces", () => {
    expect(sameNameAs(" test  amina SAMPLE", people).map((p) => p.id)).toEqual(["a"]);
  });
  it("includes switched-off people", () => {
    expect(sameNameAs("Test Yusuf Example", people).map((p) => p.id)).toEqual(["b"]);
  });
  it("ignores the person being edited", () => {
    expect(sameNameAs("Test Amina Sample", people, "a")).toEqual([]);
  });
});

describe("status words", () => {
  it("active is green, switched off is grey, always with a word", () => {
    expect(PERSON_STATUS.active).toEqual({ word: "Active", tone: "green" });
    expect(PERSON_STATUS.off).toEqual({ word: "Switched off", tone: "grey" });
  });
  it("database refusals are explained in plain words", () => {
    expect(friendlyPeopleError("That role is switched off. Pick another.")).toMatch(/switched off/);
    expect(friendlyPeopleError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyPeopleError('violates check constraint "people_phone_check"')).toMatch(/phone/i);
    expect(friendlyPeopleError(undefined)).toMatch(/try again/i);
  });
});

describe("made-up seed people", () => {
  it("about 40 people, every name starting with 'Test ' and no two the same", () => {
    expect(SEED_PEOPLE.length).toBeGreaterThanOrEqual(38);
    expect(SEED_PEOPLE.length).toBeLessThanOrEqual(42);
    for (const p of SEED_PEOPLE) expect(p.full_name).toMatch(/^Test /);
    expect(new Set(SEED_PEOPLE.map((p) => p.full_name)).size).toBe(SEED_PEOPLE.length);
  });
  it("emails use the reserved .test domain; phones use the impossible area code 00", () => {
    for (const p of SEED_PEOPLE) {
      if (p.email) expect(p.email).toMatch(/@icci-prototype\.test$/);
      if (p.phone) expect(p.phone).toMatch(/^\+353 00 /);
    }
  });
  it("uses only roles and sections from the starting lists, and every role at least once", () => {
    const roles = new Set(SEED_PERSON_ROLES.map((r) => r.name));
    const sections = new Set(SEED_SECTIONS);
    for (const p of SEED_PEOPLE) {
      expect(roles).toContain(p.role);
      expect(sections).toContain(p.section);
    }
    expect(new Set(SEED_PEOPLE.map((p) => p.role))).toEqual(roles);
  });
  it("some are switched off, and some have no phone or email", () => {
    expect(SEED_PEOPLE.some((p) => !p.active)).toBe(true);
    expect(SEED_PEOPLE.some((p) => !p.phone && !p.email)).toBe(true);
  });
  it("the starting lists match the migration (owner's choice, 15 Nov 2026)", () => {
    expect(SEED_PERSON_ROLES.filter((r) => !r.needs_vetting).map((r) => r.name)).toEqual(["Board member", "Contractor"]);
    expect(SEED_PERSON_ROLES).toHaveLength(10);
    expect(SEED_SECTIONS).toHaveLength(10);
  });
});
