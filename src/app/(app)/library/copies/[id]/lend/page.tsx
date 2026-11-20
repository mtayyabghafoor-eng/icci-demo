// Lend a copy (slice P4.4): pick a borrower (search by name) or add a new
// one, then confirm the due date (21 days, can be changed). Shows the
// borrower's books already out; at most 3.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate } from "@/lib/items/rules";
import { copyStatus, LOAN_DAYS, MAX_BOOKS_OUT, nameSearch } from "@/lib/library/loans";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayInDublin } from "@/lib/vetting/rules";
import { BackLink, buttonClass } from "@/components/ui";
import { StatusBadge } from "../../../../items/ui";
import { CannotSeeLibrary } from "../../../cannot-see";
import { BORROWER_COLUMNS, loadBook, loadBorrower, loadCopyTitles, loadLoansOfBorrower, loadLoansOfCopies, UUID, type Borrower } from "../../../data";
import { LendForm, NewBorrowerLendForm } from "../../../loan-forms";

export const metadata: Metadata = { title: "Lend a Book | ICCI Control Dashboard" };

export default function LendPage(props: PageProps<"/library/copies/[id]/lend">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/library/copies/[id]/lend">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSeeLibrary />;
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: copy } = await supabase.from("library_copies").select("id, book_id, label_serial").eq("id", id).maybeSingle();
  if (!copy) notFound();
  const book = await loadBook(supabase, copy.book_id);
  if (!book) notFound();
  const open = (await loadLoansOfCopies(supabase, [copy.id])).find((l) => l.is_open);
  const today = todayInDublin();
  const max = addDays(today, 365);
  const due = addDays(today, LOAN_DAYS);
  const here = `/library/copies/${copy.id}/lend`;

  const header = (
    <>
      <BackLink href={`/library/copies/${copy.id}`}>Back to the book</BackLink>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Lend a Book</h1>
      <p className="mt-1">
        <strong dir="auto">{book.title}</strong> <span className="font-mono text-sm">{copy.label_serial}</span>
      </p>
    </>
  );

  if (open) {
    const s = copyStatus(open);
    return (
      <>
        {header}
        <p className="mt-4 rounded-xl bg-icci-panel px-4 py-3" data-testid="already-out">
          This copy is already on loan (<StatusBadge word={s.word} tone={s.tone} />
          ). Return it first, from the{" "}
          <Link href={`/library/copies/${copy.id}`}>book&apos;s page</Link>.
        </p>
      </>
    );
  }

  // Step 2: a borrower was picked. Show their books out, then the due date.
  const picked = typeof sp.borrower === "string" ? await loadBorrower(supabase, sp.borrower) : null;
  if (picked) {
    const out = (await loadLoansOfBorrower(supabase, picked.id)).filter((l) => l.is_open);
    const titles = await loadCopyTitles(supabase, out.map((l) => l.copy_id));
    const full = out.length >= MAX_BOOKS_OUT;
    return (
      <>
        {header}
        <div className="mt-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card">
          <p className="text-sm font-semibold text-icci-ink-60">Borrower</p>
          <p className="text-xl font-bold" dir="auto" data-testid="picked-borrower">
            {picked.full_name}
          </p>
          <p className="text-[15px]">{picked.contact}</p>
          <p className="mt-3 font-semibold" data-testid="books-out">
            {out.length === 0 ? "No books out." : `${out.length} of ${MAX_BOOKS_OUT} books out:`}
          </p>
          {out.length > 0 && (
            <ul className="mt-1 list-disc space-y-1 ps-5 text-[15px]">
              {out.map((l) => (
                <li key={l.id}>
                  <span dir="auto">{titles.get(l.copy_id)?.title}</span>, due {formatDate(l.due_on)}
                  {l.days_overdue > 0 && <span className="font-semibold text-[var(--icci-bad-text)]"> (overdue)</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">
            <Link href={here}>Pick someone else</Link>
          </p>
        </div>
        {!picked.active ? (
          <p className="mt-4 rounded-xl bg-icci-panel px-4 py-3" data-testid="cannot-lend">
            This borrower is switched off. Switch them back on from their page first.
          </p>
        ) : full ? (
          <p className="mt-4 rounded-xl bg-icci-panel px-4 py-3" data-testid="cannot-lend">
            {MAX_BOOKS_OUT} books out is the most allowed. One must come back first.
          </p>
        ) : (
          <LendForm copyId={copy.id} borrowerId={picked.id} due={due} today={today} max={max} />
        )}
      </>
    );
  }

  // Step 1b: someone new.
  if (sp.new === "1") {
    return (
      <>
        {header}
        <h2 className="mt-5 text-xl font-bold">New borrower</h2>
        <p className="mt-1 text-[15px]">Adults only: a child&apos;s book is lent to their parent.</p>
        <NewBorrowerLendForm copyId={copy.id} due={due} today={today} max={max} />
        <p className="mt-3">
          <Link href={here}>Back to the search</Link>
        </p>
      </>
    );
  }

  // Step 1: search by name.
  const q = nameSearch(typeof sp.q === "string" ? sp.q : "");
  let found: Borrower[] = [];
  if (q) {
    const { data } = await supabase.from("library_borrowers").select(BORROWER_COLUMNS).eq("active", true).ilike("full_name", `%${q}%`).order("full_name").limit(20);
    found = (data ?? []) as Borrower[];
  }
  return (
    <>
      {header}
      <h2 className="mt-5 text-xl font-bold">Who is borrowing it?</h2>
      <form role="search" aria-label="Find a borrower" className="mt-2 flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Borrower&apos;s name</span>
          <input
            name="q"
            defaultValue={q}
            dir="auto"
            autoComplete="off"
            placeholder="Borrower's name"
            className="block min-h-12 w-full rounded-xl border border-[#c9d3cf] bg-white px-3.5 py-2 text-lg focus:border-icci-green"
          />
        </label>
        <button type="submit" className={buttonClass("outline", "lg")}>
          Search
        </button>
      </form>
      {q && (
        <p className="mt-3 text-[15px]" data-testid="borrower-count">
          {found.length === 0 ? `Nobody called “${q}”.` : `${found.length} found. Tap the borrower:`}
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {found.map((b) => (
          <li key={b.id}>
            <Link href={`${here}?borrower=${b.id}`} data-testid="borrower-choice" className="list-card min-h-12">
              <span className="block font-semibold text-icci-green" dir="auto">
                {b.full_name}
              </span>
              <span className="block text-sm">{b.contact}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <Link href={`${here}?new=1`} className={buttonClass("outline", "lg", "w-full")}>
          New borrower
        </Link>
      </div>
    </>
  );
}
