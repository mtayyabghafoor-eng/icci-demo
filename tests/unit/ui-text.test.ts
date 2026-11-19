import { describe, expect, it } from "vitest";
import { cx, initials, lastPage, pageOf, rangeText, readPage, titleCase } from "@/lib/ui/text";

describe("titleCase (fixed screen titles only)", () => {
  it("capitalises each main word", () => {
    expect(titleCase("Move this asset")).toBe("Move This Asset");
    expect(titleCase("Register an item")).toBe("Register an Item");
  });
  it("keeps short joining words small in the middle", () => {
    expect(titleCase("Not seen in 12 months")).toBe("Not Seen in 12 Months");
    expect(titleCase("Missing and damaged")).toBe("Missing and Damaged");
  });
  it("capitalises a small word at the start or end", () => {
    expect(titleCase("in the store")).toBe("In the Store");
    expect(titleCase("what is it for")).toBe("What Is It For");
  });
  it("leaves words that already have capitals inside them", () => {
    expect(titleCase("print ICCI labels")).toBe("Print ICCI Labels");
    expect(titleCase("export as CSV")).toBe("Export as CSV");
  });
  it("leaves Arabic and other scripts untouched", () => {
    expect(titleCase("مكتبة")).toBe("مكتبة");
  });
});

describe("cx", () => {
  it("joins class names and skips empty ones", () => {
    expect(cx("a", false, null, undefined, "", "b")).toBe("a b");
  });
});

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Test Centre Admin")).toBe("TA");
    expect(initials("  Test  ")).toBe("T");
    expect(initials("")).toBe("?");
  });
});

describe("rangeText", () => {
  it("describes the rows on a page", () => {
    expect(rangeText(1, 50, 487)).toBe("1 to 50 of 487");
    expect(rangeText(10, 50, 487)).toBe("451 to 487 of 487");
    expect(rangeText(1, 50, 0)).toBe("None");
    expect(rangeText(1, 50, 1200)).toBe("1 to 50 of 1,200");
  });
});

describe("readPage", () => {
  it("reads a page number from the address, page 1 for anything odd", () => {
    expect(readPage("3")).toBe(3);
    expect(readPage(undefined)).toBe(1);
    expect(readPage("")).toBe(1);
    expect(readPage("0")).toBe(1);
    expect(readPage("-2")).toBe(1);
    expect(readPage("abc")).toBe(1);
    expect(readPage(["2", "5"])).toBe(1);
  });
});

describe("pageOf", () => {
  const rows = Array.from({ length: 120 }, (_, i) => i + 1);
  it("cuts out one page of 50", () => {
    expect(pageOf(rows, 1, 50)).toEqual({ rows: rows.slice(0, 50), page: 1, pages: 3, total: 120 });
    expect(pageOf(rows, 3, 50).rows).toEqual(rows.slice(100, 120));
  });
  it("shows the last page when asked for one past the end", () => {
    expect(pageOf(rows, 9, 50)).toMatchObject({ page: 3, pages: 3 });
  });
  it("an empty list is one empty page", () => {
    expect(pageOf([], 4, 50)).toEqual({ rows: [], page: 1, pages: 1, total: 0 });
  });
});

describe("lastPage", () => {
  it("keeps a page number within the pages there are", () => {
    expect(lastPage(1, 120, 50)).toBe(1);
    expect(lastPage(7, 120, 50)).toBe(3);
    expect(lastPage(2, 0, 50)).toBe(1);
  });
});
