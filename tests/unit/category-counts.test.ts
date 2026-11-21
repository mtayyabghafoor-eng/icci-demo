// Slice P1.18: adding sub-categories up into main categories, and finding
// the categories a search matches.
import { describe, expect, it } from "vitest";
import { addCounts, isEmptyCount, matchCategories, NO_COUNT, rollUp } from "@/lib/categories/counts";
import { categoryGroups, type CategoryRow } from "@/lib/categories/rules";

const cat = (id: string, name: string, parent_id: string | null = null, active = true): CategoryRow => ({ id, name, parent_id, active });
const ALL = [
  cat("m-garden", "Garden, tools and cleaning equipment"),
  cat("s-lawn", "Lawnmowers", "m-garden"),
  cat("s-ladders", "Ladders", "m-garden"),
  cat("m-heat", "Heating, cooling and water"),
  cat("s-ac", "Air conditioners", "m-heat"),
  cat("s-off", "Old fans", "m-heat", false),
];
const row = (category_id: string, total: number, working: number, not_working = 0, missing = 0, with_open_tickets = 0) => ({
  ...NO_COUNT,
  category_id,
  total,
  working,
  not_working,
  missing,
  with_open_tickets,
});

describe("rollUp", () => {
  it("gives each sub-category its own numbers and each main category the sum", () => {
    const counts = rollUp(categoryGroups(ALL, { showOff: true }), [row("s-lawn", 3, 2, 1, 0, 1), row("s-ladders", 2, 2), row("s-ac", 10, 7, 2, 1)]);
    expect(counts.get("s-lawn")).toMatchObject({ total: 3, working: 2, not_working: 1, with_open_tickets: 1 });
    expect(counts.get("m-garden")).toMatchObject({ total: 5, working: 4, not_working: 1, missing: 0, with_open_tickets: 1 });
    expect(counts.get("m-heat")).toMatchObject({ total: 10, working: 7, not_working: 2, missing: 1 });
  });
  it("counts a switched-off sub-category in its main category when it is listed", () => {
    const counts = rollUp(categoryGroups(ALL, { showOff: true }), [row("s-off", 4, 4)]);
    expect(counts.get("m-heat")!.total).toBe(4);
  });
});

describe("addCounts and isEmptyCount", () => {
  it("adds every number", () => {
    expect(addCounts({ ...NO_COUNT, stock_low: 1 }, { ...NO_COUNT, stock_low: 2, total: 1 })).toMatchObject({ stock_low: 3, total: 1 });
  });
  it("is empty with no assets and no stock", () => {
    expect(isEmptyCount(NO_COUNT)).toBe(true);
    expect(isEmptyCount({ ...NO_COUNT, stock_lines: 1 })).toBe(false);
  });
});

describe("matchCategories", () => {
  it('finds "Lawnmowers" from "lawnmower" and "air conditioners" from "Air conditioner"', () => {
    expect(matchCategories("lawnmower", ALL).map((c) => c.id)).toEqual(["s-lawn"]);
    expect(matchCategories("Air conditioner", ALL).map((c) => c.id)).toEqual(["s-ac"]);
    expect(matchCategories("air conditioners", ALL).map((c) => c.id)).toEqual(["s-ac"]);
  });
  it("lists sub-categories before main categories, and leaves switched-off ones out", () => {
    expect(matchCategories("garden", ALL).map((c) => c.id)).toEqual(["m-garden"]);
    expect(matchCategories("fans", ALL)).toEqual([]);
  });
  it("finds nothing for a label number or a single letter", () => {
    expect(matchCategories("ICCI-000123", ALL)).toEqual([]);
    expect(matchCategories("a", ALL)).toEqual([]);
  });
});
