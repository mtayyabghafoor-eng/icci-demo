// Slice P2.7: the plain rules behind the vehicle screens, and the made-up
// vehicles in the seed. The database enforces the same rules (see
// tests/db/vehicles.test.ts).
import { describe, expect, it } from "vitest";
import { SEED_PEOPLE, SEED_VEHICLES } from "../../scripts/seed-data.mts";
import {
  friendlyVehicleError,
  parseRenewalForm,
  parseVehicleForm,
  suggestedUntil,
  tidyRegistration,
  worstFirst,
  worstStatus,
  type VehicleRow,
} from "@/lib/vehicles/rules";

const get = (v: Record<string, string>) => (n: string) => v[n] ?? "";
const TODAY = "2026-11-16";
const KEEPER = "0b0c3c1e-8a4f-4f0e-9a51-6f4b2a7d9e10";

function row(registration: string, statuses: [VehicleRow["tax_status"], VehicleRow["insurance_status"], VehicleRow["nct_status"]], until: string | null = null): VehicleRow {
  return {
    id: registration,
    item_id: "i",
    registration,
    make_model: null,
    keeper_person_id: null,
    nct_needed: true,
    active: true,
    item_name: "Test",
    label_serial: "ICCI-000001",
    condition: "good",
    tax_until: until,
    tax_status: statuses[0],
    insurance_until: null,
    insurance_status: statuses[1],
    nct_until: null,
    nct_status: statuses[2],
  };
}

describe("the vehicle form", () => {
  it("tidies the registration to capitals and single spaces", () => {
    expect(tidyRegistration("  ab  12-c 3 ")).toBe("AB 12-C 3");
    expect(parseVehicleForm(get({ registration: "test van 1", keeper_person_id: KEEPER }))).toEqual({
      ok: true,
      values: { registration: "TEST VAN 1", make_model: null, keeper_person_id: KEEPER, nct_needed: true },
    });
  });

  it("refuses odd characters, and reads 'NCT not needed yet' and 'nobody'", () => {
    expect(parseVehicleForm(get({ registration: "AB/12" })).ok).toBe(false);
    expect(parseVehicleForm(get({ registration: "" })).ok).toBe(false);
    expect(parseVehicleForm(get({ registration: "X".repeat(16) })).ok).toBe(false);
    expect(parseVehicleForm(get({ registration: "AB 1", nct_not_needed: "yes" }))).toMatchObject({ ok: true, values: { nct_needed: false, keeper_person_id: null } });
    expect(parseVehicleForm(get({ registration: "AB 1", keeper_person_id: "someone" })).ok).toBe(false);
  });
});

describe("the renewal form", () => {
  const ok = { kind: "tax", renewed_on: "2026-11-10", valid_until: "2027-11-10" };
  it("accepts tax, insurance or NCT with sensible dates", () => {
    expect(parseRenewalForm(get(ok), TODAY)).toEqual({ ok: true, values: ok });
    expect(parseRenewalForm(get({ ...ok, kind: "parking" }), TODAY).ok).toBe(false);
    expect(parseRenewalForm(get({ ...ok, renewed_on: "2026-11-17" }), TODAY)).toMatchObject({ ok: false, error: /future/ });
    expect(parseRenewalForm(get({ ...ok, valid_until: "2026-11-10" }), TODAY)).toMatchObject({ ok: false, error: /after the renewal/ });
    expect(parseRenewalForm(get({ ...ok, valid_until: "2029-11-11" }), TODAY)).toMatchObject({ ok: false, error: /3 years/ });
  });
  it("suggests valid until one year later", () => {
    expect(suggestedUntil("2026-02-28")).toBe("2027-02-28");
    expect(suggestedUntil("")).toBe("");
  });
});

describe("worst first", () => {
  it("orders by the worst of the three dates", () => {
    const rows = [row("C", ["valid", "valid", "not_needed"]), row("B", ["due", "valid", "valid"]), row("A", ["valid", "none", "valid"]), row("D", ["expired", "valid", "valid"])];
    expect(worstFirst(rows).map((r) => r.registration)).toEqual(["D", "A", "B", "C"]);
    expect(worstStatus(rows[0])).toBe("valid");
  });
});

describe("plain words for refusals", () => {
  it("explains a taken registration and passes the database's sentences through", () => {
    expect(friendlyVehicleError('duplicate key value violates unique constraint "vehicles_unique_registration"')).toMatch(/already has that registration/);
    expect(friendlyVehicleError("The keeper is switched off. Pick someone who is switched on.")).toMatch(/keeper/);
    expect(friendlyVehicleError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyVehicleError("42P01")).toMatch(/could not be saved/);
  });
});

describe("made-up vehicles (seed)", () => {
  it("are obviously fictional, on their own labels, with known keepers", () => {
    const labels = new Set(SEED_VEHICLES.map((v) => v.label));
    expect(labels.size).toBe(SEED_VEHICLES.length);
    for (const v of SEED_VEHICLES) {
      expect(v.registration).toMatch(/^TEST-/);
      expect(v.name).toMatch(/made up/);
      if (v.keeper) expect(SEED_PEOPLE.find((p) => p.full_name === v.keeper)?.active).toBe(true);
      for (const r of v.renewals) {
        expect(r.ago).toBeGreaterThanOrEqual(0);
        expect(r.validFor).toBeGreaterThan(0);
        expect(r.validFor).toBeLessThanOrEqual(3 * 365);
      }
    }
  });

  it("show expired, due soon, not recorded and NCT not needed", () => {
    const left = (r: { ago: number; validFor: number }) => r.validFor - r.ago;
    expect(SEED_VEHICLES.some((v) => v.renewals.some((r) => r.kind === "tax" && left(r) < 0))).toBe(true);
    expect(SEED_VEHICLES.some((v) => v.renewals.some((r) => left(r) > 0 && left(r) <= 60))).toBe(true);
    expect(SEED_VEHICLES.some((v) => v.nctNeeded && !v.renewals.some((r) => r.kind === "nct"))).toBe(true);
    expect(SEED_VEHICLES.some((v) => !v.nctNeeded)).toBe(true);
  });
});
