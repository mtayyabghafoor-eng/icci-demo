// Round C2: one page of a long list, straight from the database, instead
// of every row. The list must be in a fixed order ending with something
// unique (such as the id), so no row is skipped or shown twice between
// pages. The database also says how many rows match in all (the query must
// ask for { count: "exact" }). A page number past the end shows the last page.

type Answer = { data: readonly unknown[] | null; error: { message: string; code?: string } | null; count: number | null };

export type Page<T> = { rows: T[]; page: number; pages: number; total: number };

/** PostgREST's answer to a page past the end: "Requested range not satisfiable". */
const PAST_THE_END = "PGRST103";

export async function pageRows<T>(page: number, size: number, ask: (from: number, to: number) => PromiseLike<Answer>): Promise<Page<T>> {
  const must = async (from: number, to: number) => {
    const res = await ask(from, to);
    if (res.error) throw new Error(`A list could not be loaded: ${res.error.message}`);
    return res;
  };
  const want = Number.isSafeInteger(page) && page > 1 ? page : 1;
  const first = await ask((want - 1) * size, want * size - 1);
  if (first.error && first.error.code !== PAST_THE_END) throw new Error(`A list could not be loaded: ${first.error.message}`);
  if (!first.error && (want === 1 || (first.data ?? []).length > 0)) {
    const total = first.count ?? (first.data ?? []).length;
    return { rows: (first.data ?? []) as T[], page: want, pages: Math.max(1, Math.ceil(total / size)), total };
  }
  // Past the end: show the last page there is.
  const total = first.error ? ((await must(0, size - 1)).count ?? 0) : (first.count ?? 0);
  const last = Math.max(1, Math.ceil(total / size));
  const res = await must((last - 1) * size, last * size - 1);
  return { rows: (res.data ?? []) as T[], page: last, pages: last, total: res.count ?? total };
}
