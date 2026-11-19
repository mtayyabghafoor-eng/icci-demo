// Finishing Phase 1: the plain rules behind "Not seen in 12 months" and the
// asset register (cut-off date, grouping by place, the CSV file).
// The database side (who can read, what counts as "seen") is in
// tests/db/asset-lists.test.ts.
import { describe, expect, it } from "vitest";
import {
  REGISTER_CSV_HEADER,
  SEEN_HOW_LABEL,
  csvCell,
  groupByPlace,
  notSeenCutoff,
  registerCsv,
  toCsv,
  type RegisterRow,
} from "@/lib/assets/lists";

describe("the 12-month cut-off", () => {
  it("is the same date one year earlier", () => {
    expect(notSeenCutoff(new Date("2026-11-15T10:30:00Z")).toISOString()).toBe("2025-11-15T10:30:00.000Z");
  });
  it("29 February becomes 28 February the year before, not 1 March", () => {
    expect(notSeenCutoff(new Date("2028-02-29T12:00:00Z")).toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });
  it("every way of being seen has a plain-English label", () => {
    expect(Object.keys(SEEN_HOW_LABEL).sort()).toEqual(["back_in_use", "damage", "move", "registered", "stocktake_scan"]);
  });
});

const row = (over: Partial<RegisterRow>): RegisterRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  label_serial: "ICCI-000001",
  name: "Test chair (fictional)",
  category: "Furniture",
  place: "Test Building A › Test Room A1",
  condition: "good",
  value_cents: 1000,
  purchase_date: null,
  warranty_end: null,
  ...over,
});

describe("grouping the register by place", () => {
  it("one group per place, in name order, with a count and a total value", () => {
    const groups = groupByPlace([
      row({ place: "B place", value_cents: 500 }),
      row({ place: "A place", value_cents: 1000 }),
      row({ place: "A place", value_cents: 250 }),
    ]);
    expect(groups.map((g) => [g.place, g.rows.length, g.total_cents])).toEqual([
      ["A place", 2, 1250],
      ["B place", 1, 500],
    ]);
  });
  it("an asset with no value recorded counts as an asset but adds nothing to the total", () => {
    const [g] = groupByPlace([row({ value_cents: null }), row({ value_cents: 300 })]);
    expect(g.rows).toHaveLength(2);
    expect(g.total_cents).toBe(300);
    expect(g.without_value).toBe(1);
  });
  it("within a place, most valuable first", () => {
    const [g] = groupByPlace([row({ name: "cheap", value_cents: 1 }), row({ name: "none", value_cents: null }), row({ name: "dear", value_cents: 9 })]);
    expect(g.rows.map((r) => r.name)).toEqual(["dear", "cheap", "none"]);
  });
});

describe("the CSV file", () => {
  it("puts quotes round cells with commas, quotes or line breaks", () => {
    expect(csvCell('Chair, "oak"\nlarge')).toBe('"Chair, ""oak""\nlarge"');
    expect(csvCell("plain")).toBe("plain");
  });
  it("cannot be used to run a spreadsheet formula (a name starting with = + - @)", () => {
    for (const bad of ["=HYPERLINK(1)", "+1", "-1+2", "@SUM(A1)", "\t=1", "\r=1"]) {
      expect(csvCell(bad).replace(/^"/, "").startsWith("'"), bad).toBe(true);
    }
  });
  it("keeps Arabic text as it is", () => {
    expect(csvCell("كرسي")).toBe("كرسي");
  });
  it("starts with a marker so Excel reads Arabic correctly, and uses Windows line endings", () => {
    const text = toCsv([["a", "b"], ["c", "d"]]);
    expect(text.startsWith("﻿")).toBe(true);
    expect(text).toBe("﻿a,b\r\nc,d\r\n");
  });
  it("one line per asset, values as plain numbers a spreadsheet can add up, then a total line", () => {
    const text = registerCsv([
      row({ label_serial: "ICCI-000002", value_cents: 123456, purchase_date: "2024-03-01", condition: "damaged" }),
      row({ value_cents: null }),
    ]);
    const lines = text.replace("﻿", "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(REGISTER_CSV_HEADER.join(","));
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("1234.56");
    expect(lines[1]).toContain("Damaged");
    expect(lines[1]).toContain("2024-03-01");
    expect(lines[3]).toBe("Total,,,,,1234.56,,");
  });
});
