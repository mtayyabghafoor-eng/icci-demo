// Borrowers (slice P4.4): everyone who can borrow books, with how many books
// each has out. Search by name. Borrowers are members of the public, kept
// apart from the People directory: a name and one contact detail only.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { nameSearch } from "@/lib/library/loans";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { PrimaryLink, StatusBadge } from "../../items/ui";
import { CannotSeeLibrary } from "../cannot-see";
import { BORROWER_COLUMNS, type Borrower } from "../data";
import { DeskTabs } from "../desk-tabs";

export const metadata: Metadata = { title: "Borrowers | ICCI Control Dashboard" };

const SHOWN = 100;

export default function BorrowersPage(props: PageProps<"/library/borrowers">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <DeskTabs />
      <h1 className="page-title text-[28px] md:text-[34px]">Borrowers</h1>
      <p className="mt-2">Everyone who borrows from the library: a name and one way to contact them.</p>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/library/borrowers">["searchParams"] }) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSeeLibrary />;
  const params = await searchParams;
  const q = nameSearch(typeof params.q === "string" ? params.q : "");
  const showOff = params.off === "1";
  const supabase = await createClient();
  let query = supabase.from("library_borrowers").select(BORROWER_COLUMNS, { count: "exact" });
  if (!showOff) query = query.eq("active", true);
  if (q) query = query.ilike("full_name", `%${q}%`);
  const { data, count } = await query.order("full_name").limit(SHOWN);
  const borrowers = (data ?? []) as Borrower[];
  const total = count ?? borrowers.length;

  const ids = borrowers.map((b) => b.id);
  const { data: open } = ids.length
    ? await supabase.from("library_loan_status").select("borrower_id, days_overdue").eq("is_open", true).in("borrower_id", ids)
    : { data: [] };
  const out = new Map<string, { n: number; overdue: number }>();
  for (const l of (open ?? []) as { borrower_id: string; days_overdue: number }[]) {
    const o = out.get(l.borrower_id) ?? { n: 0, overdue: 0 };
    o.n++;
    if (l.days_overdue > 0) o.overdue++;
    out.set(l.borrower_id, o);
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <form role="search" aria-label="Search borrowers" className="flex w-full max-w-xl gap-2">
          {showOff && <input type="hidden" name="off" value="1" />}
          <label className="flex-1">
            <span className="sr-only">Name</span>
            <input
              name="q"
              defaultValue={q}
              dir="auto"
              autoComplete="off"
              placeholder="Name"
              className="block min-h-11 w-full rounded-xl border border-[#c9d3cf] bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green"
            />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-[10px] border border-icci-green/40 bg-white px-4 font-semibold text-icci-green hover:bg-icci-green-50">
            Search
          </button>
        </form>
        <PrimaryLink href="/library/borrowers/new">Add a borrower</PrimaryLink>
      </div>
      <p className="mt-4 text-[15px] text-icci-ink-60" data-testid="borrower-count">
        {total === 0
          ? q
            ? `Nobody called “${q}”.`
            : "No borrowers yet."
          : `${total} ${total === 1 ? "borrower" : "borrowers"}${q ? ` matching “${q}”` : ""}${total > SHOWN ? `, the first ${SHOWN} shown. Search to find others.` : ""}`}{" "}
        <Link href={showOff ? "/library/borrowers" : "/library/borrowers?off=1"}>{showOff ? "Hide switched-off borrowers" : "Show switched-off borrowers too"}</Link>
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {borrowers.map((b) => {
          const o = out.get(b.id);
          return (
            <li key={b.id}>
              <Link href={`/library/borrowers/${b.id}`} data-testid="borrower-row" className="list-card">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-icci-green" dir="auto">
                    {b.full_name}
                  </span>
                  {!b.active ? (
                    <StatusBadge word="Switched off" tone="grey" />
                  ) : o?.overdue ? (
                    <StatusBadge word={`${o.overdue} overdue`} tone="red" />
                  ) : o?.n ? (
                    <StatusBadge word={`${o.n} out`} tone="amber" />
                  ) : null}
                </span>
                <span className="mt-1 block text-sm">{b.contact}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
