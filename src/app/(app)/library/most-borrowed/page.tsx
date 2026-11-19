// "Most borrowed" (slice P4.5): books by how many times a copy was lent in a
// period (the last 12 months unless another is chosen). Designed for a PC
// first. CSV download for a Super Admin or Centre Admin only.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { mayDownloadLibraryCsv, PERIODS, periodQuery, readPeriod, type MostBorrowedRow } from "@/lib/library/lists";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { fieldClass } from "../../items/ui";
import { CannotSeeLibrary } from "../cannot-see";
import { CsvButton } from "../list-parts";

export const metadata: Metadata = { title: "Most Borrowed | ICCI Control Dashboard" };

export default function Page(props: PageProps<"/library/most-borrowed">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <p className="text-sm">
        <Link className="back-link" href="/library">
          ← Library
        </Link>
      </p>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Most borrowed</h1>
      <p className="mt-2">Books that were lent most often, counting every loan in the period.</p>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/library/most-borrowed">, "searchParams">) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSeeLibrary />;
  const period = readPeriod(await searchParams, todayInDublin());
  const supabase = await createClient();
  const { data } = await supabase.rpc("library_most_borrowed", { p_since: period.since, p_until: period.until });
  const rows = ((data ?? []) as MostBorrowedRow[]).map((r) => ({ ...r, loans: Number(r.loans) }));

  return (
    <>
      <form role="search" aria-label="Choose the period" className="mt-5 flex flex-wrap items-end gap-3">
        <label>
          <span className="block font-semibold">Period</span>
          <select name="period" defaultValue={period.key} className={`${fieldClass} min-w-48`}>
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-sm">From (if choosing dates)</span>
          <input type="date" name="from" defaultValue={period.key === "custom" ? period.since : ""} className={fieldClass} />
        </label>
        <label>
          <span className="block text-sm">To</span>
          <input type="date" name="to" defaultValue={period.until ?? ""} className={fieldClass} />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center rounded-[10px] border border-icci-green/40 bg-white px-4 font-semibold text-icci-green hover:bg-icci-green-50">
          Show
        </button>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="list-count">
          {rows.length === 0 ? `No book was lent in this period (${period.label.toLowerCase()}).` : `${period.label}: ${rows.length} ${rows.length === 1 ? "book" : "books"}`}
        </p>
        {mayDownloadLibraryCsv(me.roleCode) && <CsvButton href={`/library/most-borrowed/csv${periodQuery(period)}`} />}
      </div>
      {rows.length > 0 && (
        <ol className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <li key={r.book_id} data-testid="borrowed-row" className="flex items-center justify-between gap-3 rounded-xl border border-icci-line bg-white px-4 py-3">
              <span>
                <span className="mr-2 font-mono text-sm text-icci-ink-60">{i + 1}.</span>
                <Link href={`/library/books/${r.book_id}`} className="font-semibold" dir="auto">
                  {r.title}
                </Link>
                {r.author && (
                  <span className="block text-sm" dir="auto">
                    {r.author}
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap font-semibold">
                {r.loans} {r.loans === 1 ? "loan" : "loans"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
