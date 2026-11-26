// The database hands back at most 1,000 rows per request (max_rows in
// supabase/config.toml). For a list the screens need in full, such as every
// place for the drop-downs, ask page by page until a page comes back short.
// The query must be in a fixed order (for example by id) so no row is
// skipped or repeated between pages.
export const PAGE_ROWS = 1000;

// T is the row shape the screen relies on. The database's own description
// (database.types.ts) marks every column of a view as possibly empty, so
// the rows are taken as T here, as before.
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: readonly unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_ROWS) return rows;
  }
}
