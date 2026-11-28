// Phase 6 (docs/PHASE-6.md): reading the register forms. The database checks
// everything again (tests/db/service-registers.test.ts); these give the
// kinder message first.
import { describe, expect, it } from "vitest";
import { friendlyRegisterError, isRegisterKind, parseEntryForm, parseReason, yearsFrom } from "@/lib/registers/rules";

const TODAY = "2026-11-28";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

function form(fields: Record<string, string | string[]>) {
  const get = (n: string) => {
    const v = fields[n];
    return typeof v === "string" ? v : "";
  };
  const getAll = (n: string) => {
    const v = fields[n];
    return Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  };
  return [get, getAll] as const;
}

describe("funeral form", () => {
  const base = { service_date: "2026-11-20", deceased_name: "  Test   Name ", family_contact_name: "Test Contact", services: ["ghusl"], on_duty: [P1, P1, P2] };
  it("tidies names, keeps each person once and reads the ticked services", () => {
    const r = parseEntryForm("funerals", ...form(base), TODAY);
    expect(r).toEqual({
      ok: true,
      values: {
        service_date: "2026-11-20",
        deceased_name: "Test Name",
        family_contact_name: "Test Contact",
        family_contact_phone: null,
        ghusl: true,
        kafan: false,
        janazah_prayer: false,
        family_room: false,
        on_duty_person_ids: [P1, P2],
      },
    });
  });
  it.each([
    [{ service_date: "2026-11-29" }, /future/],
    [{ service_date: "1949-12-31" }, /1950/],
    [{ service_date: "" }, /date/],
    [{ deceased_name: "  " }, /person who died/],
    [{ services: [] }, /at least one service/],
    [{ on_duty: [] }, /who was on duty/],
    [{ on_duty: ["not-a-person"] }, /from the list/],
    [{ family_contact_phone: "ring me" }, /6 to 20 digits/],
    [{ deceased_name: "x".repeat(121) }, /too long/],
  ])("refuses %o", (change, message) => {
    const r = parseEntryForm("funerals", ...form({ ...base, ...change }), TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });
});

describe("Shahada and Nikah forms", () => {
  it("Shahada: the 18-or-over tick is required; a lone second witness moves up", () => {
    const base = { service_date: "2026-11-20", person_name: "Test Person", imam_person_id: P1, witness_2: "Test Witness" };
    expect(parseEntryForm("shahada", ...form(base), TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/18 or over/) });
    const r = parseEntryForm("shahada", ...form({ ...base, adult_confirmed: "yes" }), TODAY);
    expect(r).toMatchObject({ ok: true, values: { witness_1: "Test Witness", witness_2: null, adult_confirmed: true } });
  });
  it("Nikah: two witnesses, civil marriage answered, both 18 or over", () => {
    const base = {
      service_date: "2026-11-20",
      spouse_1_name: "Test One",
      spouse_2_name: "Test Two",
      officiant_person_id: P1,
      witness_1: "Test W1",
      witness_2: "Test W2",
      civil_registration: "unknown",
      adults_confirmed: "yes",
    };
    expect(parseEntryForm("nikah", ...form(base), TODAY)).toMatchObject({ ok: true, values: { wali_name: null, civil_registration: "unknown" } });
    expect(parseEntryForm("nikah", ...form({ ...base, witness_2: "" }), TODAY).ok).toBe(false);
    expect(parseEntryForm("nikah", ...form({ ...base, civil_registration: "maybe" }), TODAY).ok).toBe(false);
    expect(parseEntryForm("nikah", ...form({ ...base, adults_confirmed: "" }), TODAY).ok).toBe(false);
    expect(parseEntryForm("nikah", ...form({ ...base, officiant_person_id: "" }), TODAY).ok).toBe(false);
  });
});

describe("reasons, kinds and messages", () => {
  it("a reason is required and at most 500 characters", () => {
    expect(parseReason("  Test:  wrong ", "correction")).toEqual({ ok: true, values: "Test: wrong" });
    expect(parseReason(" ", "cancel").ok).toBe(false);
    expect(parseReason("x".repeat(501), "cancel").ok).toBe(false);
  });
  it("knows only the three registers", () => {
    expect(isRegisterKind("funerals")).toBe(true);
    expect(isRegisterKind("baptisms")).toBe(false);
  });
  it("hides database details but keeps its plain sentences", () => {
    expect(friendlyRegisterError('new row violates row-level security policy for table "nikah_entries"')).toMatch(/Only a Super Admin/);
    expect(friendlyRegisterError("This entry is cancelled. A cancelled entry cannot be corrected.")).toMatch(/cancelled/);
    expect(friendlyRegisterError('duplicate key value violates unique constraint "x"')).toMatch(/could not be saved/);
  });
  it("offers every year from this one back to 1950", () => {
    const years = yearsFrom(TODAY);
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(1950);
  });
});
