// "What we own" (slice P1.18): the database counts each sub-category
// (category_counts in migration 0043); these plain rules add the
// sub-categories up into their main category and find the categories a
// search matches ("lawnmower" finds "Lawnmowers").
import type { CategoryGroup, CategoryRow } from "./rules";

export type CategoryCount = {
  total: number;
  working: number;
  not_working: number;
  missing: number;
  with_open_tickets: number;
  stock_lines: number;
  stock_low: number;
  stock_out: number;
};

export type CategoryCountRow = CategoryCount & { category_id: string };

export const NO_COUNT: CategoryCount = {
  total: 0,
  working: 0,
  not_working: 0,
  missing: 0,
  with_open_tickets: 0,
  stock_lines: 0,
  stock_low: 0,
  stock_out: 0,
};

const KEYS = Object.keys(NO_COUNT) as (keyof CategoryCount)[];

export function addCounts(a: CategoryCount, b: CategoryCount): CategoryCount {
  const sum = { ...NO_COUNT };
  for (const k of KEYS) sum[k] = a[k] + b[k];
  return sum;
}

/** The count of every sub-category, and of every main category (the sum of its sub-categories). */
export function rollUp(groups: CategoryGroup[], rows: CategoryCountRow[]): Map<string, CategoryCount> {
  const out = new Map<string, CategoryCount>();
  for (const r of rows) out.set(r.category_id, addCounts(out.get(r.category_id) ?? NO_COUNT, r));
  for (const g of groups) {
    out.set(g.main.id, g.subs.reduce((sum, s) => addCounts(sum, out.get(s.id) ?? NO_COUNT), out.get(g.main.id) ?? NO_COUNT));
  }
  return out;
}

/** Nothing to show: no assets and no stock. */
export function isEmptyCount(c: CategoryCount): boolean {
  return c.total === 0 && c.stock_lines === 0;
}

/**
 * The categories whose names match what was typed: each word typed (with a
 * plural "s" dropped) must appear in the name. Sub-categories first.
 */
export function matchCategories(query: string, all: CategoryRow[]): CategoryRow[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
  if (words.length === 0) return [];
  return all
    .filter((c) => c.active && words.every((w) => c.name.toLowerCase().includes(w)))
    .sort((a, b) => Number(a.parent_id === null) - Number(b.parent_id === null) || a.name.localeCompare(b.name));
}
