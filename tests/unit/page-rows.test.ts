// Round C2: one page of a long list from the database (src/lib/supabase/page-rows.ts).
import { describe, expect, it } from "vitest";
import { pageRows } from "@/lib/supabase/page-rows";

/** A pretend database list of `n` rows that answers like PostgREST. */
function list(n: number) {
  const rows = Array.from({ length: n }, (_, i) => i + 1);
  const asked: [number, number][] = [];
  const ask = async (from: number, to: number) => {
    asked.push([from, to]);
    if (from > 0 && from >= n) return { data: null, error: { message: "Requested range not satisfiable", code: "PGRST103" }, count: null };
    return { data: rows.slice(from, to + 1), error: null, count: n };
  };
  return { ask, asked };
}

describe("one page at a time", () => {
  it("asks only for the page shown, and says how many there are in all", async () => {
    const l = list(1234);
    const p = await pageRows<number>(3, 50, l.ask);
    expect(p).toMatchObject({ page: 3, pages: 25, total: 1234 });
    expect(p.rows).toEqual(Array.from({ length: 50 }, (_, i) => 101 + i));
    expect(l.asked).toEqual([[100, 149]]);
  });

  it("a page past the end shows the last page", async () => {
    const l = list(120);
    const p = await pageRows<number>(9, 50, l.ask);
    expect(p).toMatchObject({ page: 3, pages: 3, total: 120 });
    expect(p.rows).toEqual(Array.from({ length: 20 }, (_, i) => 101 + i));
  });

  it("an empty list is one empty page; nonsense page numbers mean page 1", async () => {
    expect(await pageRows<number>(1, 50, list(0).ask)).toEqual({ rows: [], page: 1, pages: 1, total: 0 });
    for (const bad of [0, -3, 1.5, Number.NaN]) expect((await pageRows<number>(bad, 50, list(70).ask)).page).toBe(1);
  });

  it("a database problem is never shown as an empty list", async () => {
    const broken = async () => ({ data: null, error: { message: "down", code: "XX000" }, count: null });
    await expect(pageRows(1, 50, broken)).rejects.toThrow(/could not be loaded/);
  });
});
