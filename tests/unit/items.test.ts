import { describe, expect, it } from "vitest";
import { parseEdit, parseRegister } from "@/lib/items/form";
import { describeHistory, type HistoryRow } from "@/lib/items/history";
import {
  cleanSearch,
  safeDecode,
  formatEuro,
  labelPath,
  locationAndInside,
  locationOptions,
  locationPath,
  parseEuro,
  parseLabelNumber,
  type LocationRow,
} from "@/lib/items/rules";

const CAT = "11111111-1111-1111-1111-111111111111";
const LOC = "22222222-2222-2222-2222-222222222222";
const form = (values: Record<string, string>) => (k: string) => values[k] ?? "";

describe("label numbers", () => {
  it.each([
    ["ICCI-000123", "ICCI-000123"],
    ["icci-000123", "ICCI-000123"],
    ["ICCI 123", "ICCI-000123"],
    ["123", "ICCI-000123"],
    [" 000007 ", "ICCI-000007"],
  ])("reads %j as %s", (raw, expected) => expect(parseLabelNumber(raw)).toBe(expected));

  it.each(["", "ICCI-", "ICCI-1234567", "0", "abc", "ICCI-12a", "../items"])("refuses %j", (raw) =>
    expect(parseLabelNumber(raw)).toBeNull(),
  );

  it("the QR link holds only the number", () => {
    expect(labelPath("ICCI-000123")).toBe("/l/ICCI-000123");
  });

  // Audit fix 10: a badly formed link showed an error page.
  it.each([
    ["ICCI-000123", "ICCI-000123"],
    ["ICCI%20123", "ICCI 123"],
    ["%E0%A4%A", "%E0%A4%A"],
    ["%", "%"],
    ["%ZZ", "%ZZ"],
  ])("reads the link part %j as %j, without failing", (raw, expected) => expect(safeDecode(raw)).toBe(expected));
});

describe("money", () => {
  it("reads euros into cents", () => {
    expect(parseEuro("125.50")).toBe(12550);
    expect(parseEuro("€1,200")).toBe(120000);
    expect(parseEuro("")).toBeNull();
    expect(parseEuro("-5")).toBeUndefined();
    expect(parseEuro("12.345")).toBeUndefined();
  });

  it("shows cents as euros", () => {
    expect(formatEuro(12550)).toBe("€125.50");
    expect(formatEuro(null)).toBe("Not recorded");
  });
});

describe("locations", () => {
  const rows: LocationRow[] = [
    { id: "b", name: "Building", kind: "building", parent_id: null },
    { id: "r", name: "Room", kind: "room", parent_id: "b" },
    { id: "s", name: "Store", kind: "store_room", parent_id: "r" },
    { id: "h", name: "Shelf", kind: "shelf", parent_id: "s" },
    { id: "x", name: "Closed", kind: "building", parent_id: null, active: false },
  ];
  const map = new Map(rows.map((r) => [r.id, r]));

  it("shows the full path", () => expect(locationPath("h", map)).toBe("Building › Room › Store › Shelf"));
  it("finds everything inside a location", () => expect(locationAndInside("r", rows).sort()).toEqual(["h", "r", "s"]));
  it("lists only switched-on places of the right kind", () => {
    expect(locationOptions(rows, ["store_room", "shelf"]).map((o) => o.id)).toEqual(["s", "h"]);
    expect(locationOptions(rows).map((o) => o.id)).not.toContain("x");
  });
});

describe("search text", () => {
  it("removes characters that would change the database filter", () => {
    expect(cleanSearch("chair,name.eq.x)")).toBe("chair_name_eq_x");
    expect(cleanSearch("lectern (oak)")).toBe("lectern _oak");
    expect(cleanSearch("  سجادة  ")).toBe("سجادة");
  });
});

describe("register form", () => {
  const base = { label: "123", kind: "fixed_asset", name: " Test chair ", category_id: CAT, location_id: LOC };

  it("accepts a fixed asset, starting in good condition", () => {
    const r = parseRegister(form(base));
    expect(r).toEqual({
      ok: true,
      values: { label_serial: "ICCI-000123", kind: "fixed_asset", name: "Test chair", category_id: CAT, location_id: LOC, condition: "good", unit: null, minimum_level: null },
    });
  });

  it("a consumable needs a unit and a whole-number minimum", () => {
    expect(parseRegister(form({ ...base, kind: "consumable" })).ok).toBe(false);
    expect(parseRegister(form({ ...base, kind: "consumable", unit: "box", minimum_level: "2.5" })).ok).toBe(false);
    const ok = parseRegister(form({ ...base, kind: "consumable", unit: "box", minimum_level: "4" }));
    expect(ok.ok && ok.values).toMatchObject({ condition: null, unit: "box", minimum_level: 4 });
  });

  it("refuses a missing label, kind, name, category or location", () => {
    for (const k of ["label", "kind", "name", "category_id", "location_id"]) {
      expect(parseRegister(form({ ...base, [k]: "" })).ok, k).toBe(false);
    }
  });
});

describe("edit form", () => {
  const base = { name: "Test chair", category_id: CAT };

  it("reads value and dates for a fixed asset", () => {
    const r = parseEdit(form({ ...base, value: "99.90", purchase_date: "2026-01-01", warranty_end: "2027-01-01", notes: "" }), "fixed_asset");
    expect(r).toEqual({
      ok: true,
      values: {
        name: "Test chair",
        category_id: CAT,
        notes: null,
        value_cents: 9990,
        purchase_date: "2026-01-01",
        warranty_end: "2027-01-01",
        // P1.19: none chosen
        supplier_company_id: null,
        model_id: null,
        maker_serial: null,
        service_company_id: null,
      },
    });
  });

  it("P1.19: reads the make and model, maker's serial number and companies; refuses anything not from the lists", () => {
    const r = parseEdit(form({ ...base, model_id: LOC, maker_serial: " SN-1 ", supplier_company_id: CAT, service_company_id: CAT }), "fixed_asset");
    expect(r.ok && r.values).toMatchObject({ model_id: LOC, maker_serial: "SN-1", supplier_company_id: CAT, service_company_id: CAT });
    expect(parseEdit(form({ ...base, model_id: "nope" }), "fixed_asset").ok).toBe(false);
    // A consumable keeps only its supplier.
    const c = parseEdit(form({ ...base, unit: "box", minimum_level: "2", supplier_company_id: CAT, model_id: LOC }), "consumable");
    expect(c.ok && c.values).toMatchObject({ supplier_company_id: CAT });
    expect(c.ok && "model_id" in c.values).toBe(false);
  });

  it("refuses a warranty ending before the purchase", () => {
    const r = parseEdit(form({ ...base, purchase_date: "2026-05-01", warranty_end: "2026-01-01" }), "fixed_asset");
    expect(r).toEqual({ ok: false, error: "The warranty cannot end before the purchase date." });
  });

  it("never sends location, condition, kind or label (those cannot be edited)", () => {
    const r = parseEdit(form({ ...base, location_id: LOC, condition: "missing", kind: "consumable", label_serial: "ICCI-000001" }), "fixed_asset");
    expect(r.ok && Object.keys(r.values)).not.toEqual(expect.arrayContaining(["location_id"]));
    expect(r.ok && Object.keys(r.values).some((k) => ["condition", "kind", "label_serial"].includes(k))).toBe(false);
  });
});

describe("history in plain words", () => {
  const lookups = { categories: new Map([[CAT, "Furniture"]]), locations: new Map([[LOC, "Room A1"]]) };
  const rows: HistoryRow[] = [
    { id: 1, action: "insert", changed_at: "2026-11-14T10:00:00Z", changed_by_name: "Test Centre Admin", old_values: null, new_values: { label_serial: "ICCI-000123", name: "Chair" } },
    {
      id: 2,
      action: "update",
      changed_at: "2026-11-14T11:00:00Z",
      changed_by_name: "Test Super Admin",
      old_values: { name: "Chair", value_cents: null, category_id: CAT, photo_path: null, updated_at: "a" },
      new_values: { name: "Blue chair", value_cents: 2500, category_id: CAT, photo_path: "x.jpg", updated_at: "b" },
    },
  ];

  it("describes registration and each changed field, ignoring bookkeeping fields", () => {
    const lines = describeHistory(rows, lookups);
    expect(lines[0]).toMatchObject({ title: "Registered", who: "Test Centre Admin", changes: ["Label ICCI-000123"] });
    expect(lines[1].changes).toEqual(["Name: Chair → Blue chair", "Value: nothing → €25.00", "Photo added"]);
  });
});
