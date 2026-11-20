// Slice P1.12: place numbers (PL-0001), the place label sheet (14 per A4),
// what goes inside what, and the camera scanner reading place labels.
import { describe, expect, it } from "vitest";
import { codeFromScan } from "@/lib/items/scan";
import {
  CHILD_KIND,
  friendlyPlaceError,
  layoutPlaceSheets,
  parsePlaceCode,
  parsePlaceForm,
  placeCode,
  placeLink,
  PLACE_SHEET_MM,
  PLACES_PER_SHEET,
} from "@/lib/places/rules";

describe("place numbers", () => {
  it("are shown as PL- and four figures, or more when needed", () => {
    expect(placeCode(1)).toBe("PL-0001");
    expect(placeCode(42)).toBe("PL-0042");
    expect(placeCode(12345)).toBe("PL-12345");
  });

  it("are read back from typed or scanned text", () => {
    expect(parsePlaceCode("PL-0001")).toBe(1);
    expect(parsePlaceCode(" pl 42 ")).toBe(42);
    expect(parsePlaceCode("pl-12345")).toBe(12345);
  });

  it("refuse anything else, including item label numbers", () => {
    for (const bad of ["", "0042", "PL-0", "PL-", "ICCI-000042", "PL-12a", "PL-99999999", null, undefined]) {
      expect(parsePlaceCode(bad), String(bad)).toBeNull();
    }
  });

  it("put only the web address and the number in a label's QR code", () => {
    expect(placeLink("https://icci.example.ie", 7)).toBe("https://icci.example.ie/p/PL-0007");
    expect(placeLink("https://icci.example.ie/anything?x=1", 7)).toBe("https://icci.example.ie/p/PL-0007");
    expect(() => placeLink("javascript:alert(1)", 7)).toThrow();
    expect(() => placeLink("https://icci.example.ie", 0)).toThrow();
  });
});

describe("what goes inside what", () => {
  it("follows building > room > store room > shelf", () => {
    expect(CHILD_KIND.building).toBe("room");
    expect(CHILD_KIND.room).toBe("store_room");
    expect(CHILD_KIND.store_room).toBe("shelf");
    expect(CHILD_KIND.shelf).toBeNull();
  });
});

describe("the add or rename form", () => {
  const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";

  it("keeps a trimmed name and optional notes", () => {
    expect(parsePlaceForm(form({ name: "  Store 2  ", notes: " Behind the hall " }))).toEqual({
      ok: true,
      values: { name: "Store 2", notes: "Behind the hall" },
    });
    expect(parsePlaceForm(form({ name: "Shelf B3" }))).toEqual({ ok: true, values: { name: "Shelf B3", notes: null } });
  });

  it("accepts Arabic names", () => {
    expect(parsePlaceForm(form({ name: "المكتبة" }))).toEqual({ ok: true, values: { name: "المكتبة", notes: null } });
  });

  it("refuses an empty or very long name, and very long notes", () => {
    expect(parsePlaceForm(form({ name: "   " })).ok).toBe(false);
    expect(parsePlaceForm(form({ name: "x".repeat(81) })).ok).toBe(false);
    expect(parsePlaceForm(form({ name: "Ok", notes: "x".repeat(501) })).ok).toBe(false);
  });
});

describe("database messages in plain words", () => {
  it("explains the common refusals", () => {
    expect(friendlyPlaceError('duplicate key value violates unique constraint "locations_unique_name_per_parent"')).toMatch(/already a place called/i);
    expect(friendlyPlaceError("This place still holds 3 things.")).toMatch(/still holds/i);
    expect(friendlyPlaceError("Switch off the places inside it first.")).toMatch(/inside it first/i);
    expect(friendlyPlaceError("new row violates row-level security policy")).toMatch(/not allowed/i);
    expect(friendlyPlaceError("something odd")).toMatch(/try again/i);
  });
});

describe("the place label sheet", () => {
  it("is A4 with 14 labels of 99.1 x 38.1 mm that fit the page", () => {
    expect(PLACES_PER_SHEET).toBe(14);
    const m = PLACE_SHEET_MM;
    expect(m.columns * m.labelWidth + (m.columns - 1) * m.columnGap + 2 * m.side).toBeCloseTo(m.pageWidth, 1);
    expect(m.rows * m.labelHeight + 2 * m.top).toBeCloseTo(m.pageHeight, 1);
  });

  it("fills sheets in order, leaving skipped spaces and the end empty", () => {
    const sheets = layoutPlaceSheets(["a", "b", "c"], 2);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].slice(0, 5)).toEqual([null, null, "a", "b", "c"]);
    expect(sheets[0]).toHaveLength(14);
    expect(layoutPlaceSheets(Array.from({ length: 15 }, (_, i) => String(i)))).toHaveLength(2);
    expect(layoutPlaceSheets([])).toEqual([]);
  });
});

describe("the camera scanner reads both kinds of label", () => {
  it("opens the item label page for an ICCI label", () => {
    expect(codeFromScan("https://icci.example.ie/l/ICCI-000123")).toBe("/l/ICCI-000123");
    expect(codeFromScan("ICCI-000123")).toBe("/l/ICCI-000123");
  });

  it("opens the place page for a place label", () => {
    expect(codeFromScan("https://icci.example.ie/p/PL-0007")).toBe("/p/PL-0007");
    expect(codeFromScan("http://localhost:3000/p/pl-7/")).toBe("/p/PL-0007");
    expect(codeFromScan("PL-0007")).toBe("/p/PL-0007");
  });

  it("follows nothing else", () => {
    expect(codeFromScan("https://example.test/p/not-a-place")).toBeNull();
    expect(codeFromScan("https://example.test/elsewhere")).toBeNull();
    expect(codeFromScan("javascript:alert(1)")).toBeNull();
    expect(codeFromScan("")).toBeNull();
  });
});
