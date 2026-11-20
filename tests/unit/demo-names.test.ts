import { describe, expect, it } from "vitest";
import { demoText, dressForDemo } from "../../scripts/demo-names.mts";
import {
  SEED_ADMINS,
  SEED_BORROWERS,
  SEED_LOCATIONS,
  SEED_PEOPLE,
  SEED_POLICIES,
  SEED_TICKETS,
  SEED_TYPED_RENEWALS,
  SEED_VEHICLES,
  seedItems,
  seedLibrary,
} from "../../scripts/seed-data.mts";

describe("demo names (staging demo only)", () => {
  it("gives the places real-style names", () => {
    expect(demoText("Test Room A1")).toBe("Main Prayer Hall");
    expect(demoText("Test Shelf B1-1-2")).toBe("Library Store Shelf 2");
  });

  it("names equipment as the Centre would", () => {
    expect(demoText("Test folding chair 07")).toBe("Stacking chair 07");
    expect(demoText("Test bin bags")).toBe("Bin bags");
  });

  it("keeps people clearly fictional: surname Demo", () => {
    expect(demoText("Test Amina Sample")).toBe("Amina S. Demo");
    expect(demoText("Test Aisha Pageturner")).toBe("Aisha Pageturner");
  });

  it("UI-9: gives the demo admins (and their linked person records) realistic made-up names", () => {
    expect(demoText("Test Centre Admin")).toBe("Tariq A. Demo");
    expect(demoText("Test Second Admin")).toBe("Layla M. Demo");
    const names = dressForDemo(SEED_ADMINS.map((a) => a.displayName));
    expect(names.every((n) => / Demo$/.test(n))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("UI-9: gives the demo vehicles Centre-style fleet numbers and names", () => {
    expect(dressForDemo(SEED_VEHICLES).map((v) => [v.registration, v.name])).toEqual([
      ["ICCI-BUS-01", "Community Minibus (16-seat)"],
      ["ICCI-VAN-01", "Centre Transit Van"],
      ["ICCI-CAR-01", "Admin Pool Car"],
    ]);
    expect(JSON.stringify(dressForDemo(SEED_VEHICLES))).not.toMatch(/TEST-|Sample|Example|Placeholder/);
  });

  it("UI-9: disposal notes read like real ones", () => {
    expect(demoText("Test disposal: made-up, beyond repair")).toBe("Damaged beyond economical repair during Hall refurbishment");
    expect(demoText("Test Charity Shop (made up)")).toBe("Local charity shop");
  });

  it("tidies tickets, notes, policies and books", () => {
    expect(demoText("Chair wobbles, one leg loose (made up)")).toBe("Chair wobbles, one leg loose");
    expect(demoText("Test: electrician booked for tomorrow")).toBe("Electrician booked for tomorrow");
    expect(demoText("Test correction: the delivery note said two more")).toBe("Correction: the delivery note said two more");
    expect(demoText("Test policy: Health and safety")).toBe("Health and safety policy");
    expect(demoText("The Little River (made up)")).toBe("The Little River");
    expect(demoText("Test Author C Example")).toBe("Celine C. Example");
    expect(demoText("حديقة القصص (تجريبي)")).toBe("حديقة القصص");
  });

  it("leaves everything else alone: emails, labels, categories, roles", () => {
    for (const s of ["centre.admin@icci-prototype.test", "ICCI-000123", "Furniture", "Imam", "fixed_asset", "+353 00 000 0101"]) {
      expect(demoText(s)).toBe(s);
    }
  });

  it("gives the same result when run twice", () => {
    const all = [SEED_LOCATIONS, SEED_PEOPLE, SEED_TICKETS, SEED_POLICIES, seedItems(), seedLibrary()];
    expect(dressForDemo(dressForDemo(all))).toEqual(dressForDemo(all));
  });

  it("keeps every name unique where the seed looks things up by name", () => {
    const unique = (xs: string[]) => expect(new Set(xs).size).toBe(xs.length);
    unique(dressForDemo(SEED_LOCATIONS).map((l) => l.name));
    unique(dressForDemo(SEED_PEOPLE).map((p) => p.full_name));
    unique(dressForDemo(SEED_BORROWERS).map((b) => b.full_name));
    unique(dressForDemo(seedLibrary()).map((b) => b.title));
    unique(dressForDemo(seedItems()).filter((i) => i.kind === "fixed_asset").map((i) => i.name));
  });

  it("leaves no 'Test' prefix or '(made up)' tag in what the demo shows", () => {
    const shown = JSON.stringify(
      dressForDemo([
        SEED_ADMINS.map((a) => a.displayName),
        SEED_LOCATIONS,
        SEED_PEOPLE.map((p) => p.full_name),
        SEED_BORROWERS.map((b) => b.full_name),
        SEED_POLICIES,
        SEED_VEHICLES,
        SEED_TYPED_RENEWALS,
        SEED_TICKETS,
        seedItems(),
        seedLibrary(),
      ]),
    );
    expect(shown).not.toMatch(/"Test |\(made[ -]up\)|تجريبي\)/);
  });
});
