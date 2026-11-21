// Slice P1.17: the plain rules behind the two-level category list.
import { describe, expect, it } from "vitest";
import {
  categoryAndInside,
  categoryGroups,
  categoryPath,
  compareCategoryNames,
  friendlyCategoryError,
  parseCategoryForm,
  type CategoryRow,
} from "@/lib/categories/rules";

const cat = (id: string, name: string, parent_id: string | null = null, active = true): CategoryRow => ({ id, name, parent_id, active });

const ALL: CategoryRow[] = [
  cat("m-other", "Other"),
  cat("s-other", "Other items", "m-other"),
  cat("m-garden", "Garden, tools and cleaning equipment"),
  cat("s-ladders", "Ladders", "m-garden"),
  cat("s-lawn", "Lawnmowers", "m-garden"),
  cat("s-garden-other", "Other tools and equipment", "m-garden"),
  cat("s-blowers", "Leaf blowers", "m-garden", false),
  cat("m-furn", "Furniture and furnishings"),
  cat("s-chairs", "Chairs", "m-furn"),
  cat("m-empty", "A main with nothing in it"),
];
const byId = new Map(ALL.map((c) => [c.id, c]));
const form = (values: Record<string, string>) => (k: string) => values[k] ?? "";

describe("categoryPath", () => {
  it('shows "Main › Sub" for a sub-category and the name alone for a main one', () => {
    expect(categoryPath("s-lawn", byId)).toBe("Garden, tools and cleaning equipment › Lawnmowers");
    expect(categoryPath("m-furn", byId)).toBe("Furniture and furnishings");
  });
  it("says so when the category is not known", () => {
    expect(categoryPath("nope", byId)).toBe("Unknown category");
  });
});

describe("categoryAndInside (the item list filter)", () => {
  it("a main category means every sub-category inside it, switched off ones too", () => {
    expect(categoryAndInside("m-garden", ALL).sort()).toEqual(["m-garden", "s-blowers", "s-garden-other", "s-ladders", "s-lawn"]);
  });
  it("a sub-category means just itself", () => {
    expect(categoryAndInside("s-lawn", ALL)).toEqual(["s-lawn"]);
  });
});

describe("compareCategoryNames", () => {
  it('sorts by name, with "Other ..." always last', () => {
    const names = ["Other items", "Lawnmowers", "Other", "Chairs", "Ladders", "Otherwise named"];
    expect([...names].sort(compareCategoryNames)).toEqual(["Chairs", "Ladders", "Lawnmowers", "Otherwise named", "Other", "Other items"]);
  });
});

describe("categoryGroups", () => {
  it("lists main categories with their sub-categories, Other last, switched off hidden", () => {
    const groups = categoryGroups(ALL);
    expect(groups.map((g) => g.main.name)).toEqual(["A main with nothing in it", "Furniture and furnishings", "Garden, tools and cleaning equipment", "Other"]);
    expect(groups.find((g) => g.main.id === "m-garden")!.subs.map((s) => s.name)).toEqual(["Ladders", "Lawnmowers", "Other tools and equipment"]);
  });
  it("shows switched-off ones when asked", () => {
    const garden = categoryGroups(ALL, { showOff: true }).find((g) => g.main.id === "m-garden")!;
    expect(garden.subs.map((s) => s.name)).toContain("Leaf blowers");
  });
  it("for a picker, leaves out main categories with nothing to pick, but keeps the item's current one", () => {
    const pick = categoryGroups(ALL, { pickable: true });
    expect(pick.map((g) => g.main.id)).not.toContain("m-empty");
    const keep = categoryGroups(ALL, { pickable: true, keep: "s-blowers" }).find((g) => g.main.id === "m-garden")!;
    expect(keep.subs.map((s) => s.id)).toContain("s-blowers");
  });
});

describe("parseCategoryForm", () => {
  it("tidies the name", () => {
    expect(parseCategoryForm(form({ name: "  Air   conditioners " }))).toEqual({ ok: true, values: { name: "Air conditioners" } });
  });
  it("needs a name of 60 characters or fewer", () => {
    expect(parseCategoryForm(form({ name: " " }))).toMatchObject({ ok: false });
    expect(parseCategoryForm(form({ name: "x".repeat(61) }))).toMatchObject({ ok: false });
  });
});

describe("friendlyCategoryError", () => {
  it("explains a name that is already used", () => {
    expect(friendlyCategoryError('duplicate key value violates unique constraint "item_categories_unique_name"')).toMatch(/already a category called that/);
  });
  it("passes the database's own plain refusals through", () => {
    expect(friendlyCategoryError("Switch off its sub-categories first.")).toBe("Switch off its sub-categories first.");
    expect(friendlyCategoryError("That main category is switched off. Switch it back on first.")).toMatch(/switched off/);
  });
  it("never shows a raw database message", () => {
    expect(friendlyCategoryError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyCategoryError("some internal thing")).toBe("That could not be saved. Please check the details and try again.");
  });
});
