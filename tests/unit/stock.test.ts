// Slice 5: the plain stock rules (status words, quantities typed in, usage).
// The arithmetic itself is done by the database and tested in tests/db/stock.test.ts.
import { describe, expect, it } from "vitest";
import { describeUsage, parseQuantity, parseReason, STOCK_STATUS, stockStatus } from "@/lib/stock/rules";

describe("stock status (colour always with a word)", () => {
  it("is 'Not counted yet' (grey) before the first count", () => {
    expect(stockStatus(null, 5)).toBe("not_counted");
    expect(STOCK_STATUS.not_counted).toEqual({ word: "Not counted yet", tone: "grey" });
  });

  it("is 'Out' (red) at zero, even when the minimum is zero", () => {
    expect(stockStatus(0, 5)).toBe("out");
    expect(stockStatus(0, 0)).toBe("out");
    expect(STOCK_STATUS.out).toEqual({ word: "Out", tone: "red" });
  });

  it("is 'Low' (amber) at or below the minimum", () => {
    expect(stockStatus(5, 5)).toBe("low");
    expect(stockStatus(1, 5)).toBe("low");
    expect(STOCK_STATUS.low).toEqual({ word: "Low", tone: "amber" });
  });

  it("is 'In stock' (green) above the minimum", () => {
    expect(stockStatus(6, 5)).toBe("in_stock");
    expect(stockStatus(1, 0)).toBe("in_stock");
    expect(STOCK_STATUS.in_stock).toEqual({ word: "In stock", tone: "green" });
  });
});

describe("quantities typed into a form", () => {
  it("accepts whole numbers, with spaces around them", () => {
    expect(parseQuantity(" 12 ", "count")).toEqual({ ok: true, value: 12 });
    expect(parseQuantity("0", "count")).toEqual({ ok: true, value: 0 });
    expect(parseQuantity("3", "restock")).toEqual({ ok: true, value: 3 });
  });

  it("refuses blanks, words, decimals and negative numbers", () => {
    for (const raw of ["", "  ", "ten", "2.5", "-1", "1e3", "12abc"]) {
      expect(parseQuantity(raw, "count").ok, raw).toBe(false);
    }
  });

  it("refuses adding zero stock", () => {
    expect(parseQuantity("0", "restock").ok).toBe(false);
  });

  it("refuses silly large numbers", () => {
    expect(parseQuantity("1000001", "count").ok).toBe(false);
  });

  it("a correction may be zero (e.g. the restock never happened)", () => {
    expect(parseQuantity("0", "correction")).toEqual({ ok: true, value: 0 });
  });
});

describe("reasons", () => {
  it("must be written, and are trimmed", () => {
    expect(parseReason("  Typed 10 instead of 12  ")).toEqual({ ok: true, value: "Typed 10 instead of 12" });
    expect(parseReason("   ").ok).toBe(false);
  });

  it("accept Arabic", () => {
    expect(parseReason("خطأ في العد")).toEqual({ ok: true, value: "خطأ في العد" });
  });
});

describe("usage since the last count, in plain words", () => {
  it("says nothing useful until there are two counts", () => {
    expect(describeUsage(null, "roll")).toBe("Needs two counts");
  });

  it("says how many were used", () => {
    expect(describeUsage(3, "roll")).toBe("3 roll used since the count before");
    expect(describeUsage(0, "box")).toBe("None used since the count before");
  });

  it("explains when more was found than expected", () => {
    expect(describeUsage(-2, "pack")).toBe("2 pack more found than expected (a restock may not have been entered)");
  });
});
