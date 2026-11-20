// Slice 7: where labels sit on the A4 sheet, what the QR code holds, and the
// boxes on the "Print labels" screen.
import { describe, expect, it } from "vitest";
import {
  friendlyLabelError,
  labelLink,
  labelsAreTest,
  labelTag,
  layoutSheets,
  LABELS_PER_SHEET,
  parsePrintCount,
  parseSkip,
  qrMatrix,
  qrSvgPath,
  serialsInRange,
  sheetsNeeded,
  SHEET_MM,
} from "@/lib/labels/sheet";

describe("the A4 sheet (Avery L7160 size)", () => {
  it("has 21 labels of 63.5 x 38.1 mm that fit the page exactly", () => {
    expect(SHEET_MM.columns * SHEET_MM.rows).toBe(LABELS_PER_SHEET);
    const width = 2 * SHEET_MM.side + SHEET_MM.columns * SHEET_MM.labelWidth + (SHEET_MM.columns - 1) * SHEET_MM.columnGap;
    const height = 2 * SHEET_MM.top + SHEET_MM.rows * SHEET_MM.labelHeight;
    expect(width).toBeCloseTo(SHEET_MM.pageWidth, 0);
    expect(height).toBeCloseTo(SHEET_MM.pageHeight, 1);
  });
});

describe("placing labels on sheets", () => {
  it("21 labels fill exactly one sheet, in order", () => {
    const serials = serialsInRange(301, 321);
    const sheets = layoutSheets(serials);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toEqual(serials);
  });

  it("22 labels need a second sheet with one label and 20 empty spaces", () => {
    const sheets = layoutSheets(serialsInRange(1, 22));
    expect(sheets).toHaveLength(2);
    expect(sheets[1][0]).toBe("ICCI-000022");
    expect(sheets[1].slice(1).every((c) => c === null)).toBe(true);
  });

  it("skipping spaces leaves the start of a part-used sheet empty", () => {
    const sheets = layoutSheets(serialsInRange(1, 21), 5);
    expect(sheets).toHaveLength(2);
    expect(sheets[0].slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(sheets[0][5]).toBe("ICCI-000001");
    expect(sheets[1].filter(Boolean)).toHaveLength(5);
    expect(sheetsNeeded(21, 5)).toBe(2);
    expect(sheetsNeeded(16, 5)).toBe(1);
  });

  it("every sheet always has 21 spaces", () => {
    for (const sheet of layoutSheets(serialsInRange(1, 50), 3)) expect(sheet).toHaveLength(21);
  });

  it("an empty or back-to-front range gives no labels", () => {
    expect(serialsInRange(10, 9)).toEqual([]);
    expect(serialsInRange(0, 3)).toEqual([]);
    expect(layoutSheets([])).toEqual([]);
  });
});

describe("the QR code", () => {
  it("holds only the web link with the label number", () => {
    expect(labelLink("http://localhost:3000", "ICCI-000301")).toBe("http://localhost:3000/l/ICCI-000301");
    expect(labelLink("https://example.test/some/page?x=1", "ICCI-000301")).toBe("https://example.test/l/ICCI-000301");
  });

  it("refuses anything that is not a label number or a web address", () => {
    for (const bad of ["ICCI-1", "icci-000301", "ICCI-000301?name=x", "<script>"]) {
      expect(() => labelLink("http://localhost:3000", bad), bad).toThrow();
    }
    expect(() => labelLink("javascript:alert(1)", "ICCI-000301")).toThrow();
  });

  it("is a proper square QR code with the three corner squares", () => {
    const m = qrMatrix("http://localhost:3000/l/ICCI-000301");
    const size = m.length;
    expect(size).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === size)).toBe(true);
    // Each corner square has a dark outer ring and a dark 3x3 centre.
    for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      for (let i = 0; i < 7; i++) {
        expect(m[r0][c0 + i]).toBe(true);
        expect(m[r0 + 6][c0 + i]).toBe(true);
        expect(m[r0 + i][c0]).toBe(true);
      }
      expect(m[r0 + 1][c0 + 1]).toBe(false);
      expect(m[r0 + 3][c0 + 3]).toBe(true);
    }
  });

  it("is the same every time for the same label, and different for another", () => {
    const a = qrSvgPath(qrMatrix("http://localhost:3000/l/ICCI-000301"), 2);
    expect(qrSvgPath(qrMatrix("http://localhost:3000/l/ICCI-000301"), 2)).toBe(a);
    expect(qrSvgPath(qrMatrix("http://localhost:3000/l/ICCI-000302"), 2)).not.toBe(a);
    expect(a.startsWith("M2 2h1v1h-1z")).toBe(true);
  });
});

describe("the Print labels screen", () => {
  it("accepts 1 to 210 labels", () => {
    expect(parsePrintCount("21")).toEqual({ ok: true, value: 21 });
    expect(parsePrintCount(" 210 ")).toEqual({ ok: true, value: 210 });
    for (const bad of ["0", "211", "-3", "2.5", "", "abc"]) expect(parsePrintCount(bad).ok, bad).toBe(false);
  });

  it("skip spaces is 0 to 20; anything else means none", () => {
    expect(parseSkip("5")).toBe(5);
    expect(parseSkip("20")).toBe(20);
    for (const bad of ["21", "-1", "x", "", undefined]) expect(parseSkip(bad)).toBe(0);
    expect(parseSkip(["3", "4"])).toBe(3);
  });

  it("labels say TEST LABEL everywhere except production", () => {
    expect(labelsAreTest("development")).toBe(true);
    expect(labelsAreTest(undefined)).toBe(true);
    expect(labelsAreTest("production")).toBe(false);
  });

  it("UI-9: the printed tag is red TEST LABEL in development, a quiet DEMO on the demo, nothing in production", () => {
    expect(labelTag("development")).toBe("TEST LABEL");
    expect(labelTag(undefined)).toBe("TEST LABEL");
    expect(labelTag("staging")).toBe("DEMO");
    expect(labelTag("production")).toBeNull();
  });

  it("turns database messages into plain words", () => {
    expect(friendlyLabelError("Only a Super Admin or Centre Admin can print labels.")).toMatch(/cannot print labels/);
    expect(friendlyLabelError("Choose between 1 and 210 labels")).toMatch(/between 1 and 210/);
    expect(friendlyLabelError("something odd")).toMatch(/try again/);
  });
});
