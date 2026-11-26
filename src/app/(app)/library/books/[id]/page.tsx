// One book (slice P4.2): its details, every copy with its label and status,
// "Correct the details" and "Add another copy". Since P4.4 each copy shows
// whether it is on loan (and who has it), and the book's loan history.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate } from "@/lib/items/rules";
import { loanOutcome } from "@/lib/library/loans";
import { statusWord } from "@/lib/library/lists";
import { formatIsbn, LANGUAGE_LABEL, mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { loadBook, loadBorrowers, loadCopies, loadCopyRows, loadLoansOfCopies } from "../../data";
import { BackLink, CannotSee, PageNotice, PrimaryLink, SecondaryLink, Skeleton, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Book | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Book added, with its first copy.",
  "copy-added": "Copy added.",
  saved: "Changes saved. The earlier details stay in the record’s history.",
};

export default function BookPage(props: PageProps<"/library/books/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <BackLink href="/library">Library</BackLink>
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/library/books/[id]">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSee area="library" />;
  const { id } = await params;
  const { done } = await searchParams;
  const supabase = await createClient();
  const book = await loadBook(supabase, id);
  if (!book) notFound();
  const copies = await loadCopies(supabase, book.id);
  const rows = await loadCopyRows(supabase, copies.map((c) => c.id));
  const loans = await loadLoansOfCopies(supabase, copies.map((c) => c.id));
  const borrowers = await loadBorrowers(supabase, loans.map((l) => l.borrower_id));
  const openOf = new Map(loans.filter((l) => l.is_open).map((l) => [l.copy_id, l]));
  const labelOf = new Map(copies.map((c) => [c.id, c.label_serial]));

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]" dir="auto">
          {book.title}
        </h1>
        {!book.active && <StatusBadge word="Switched off" tone="grey" />}
      </div>
      {book.author && (
        <p className="mt-1 text-lg" dir="auto" data-testid="book-author">
          {book.author}
        </p>
      )}
      {typeof done === "string" && DONE[done] && (
        <PageNotice floating testId="notice">{DONE[done]}</PageNotice>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-3 rounded-2xl border border-icci-line bg-white p-5 shadow-card sm:grid-cols-[10rem_1fr]">
        <dt className="text-sm font-semibold text-icci-ink-60">Language</dt>
        <dd>{LANGUAGE_LABEL[book.language]}</dd>
        <dt className="text-sm font-semibold text-icci-ink-60">ISBN</dt>
        <dd className="font-mono" data-testid="book-isbn">
          {book.isbn ? formatIsbn(book.isbn) : "None"}
        </dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Publisher</dt>
        <dd dir="auto">{book.publisher ?? "Not recorded"}</dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Year</dt>
        <dd>{book.published_year ?? "Not recorded"}</dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Details from</dt>
        <dd data-testid="book-source">{book.entered_by === "looked_up" ? "Open Library, checked when added" : "Typed by hand"}</dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Added</dt>
        <dd>{formatDate(book.created_at.slice(0, 10))}</dd>
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        {book.active && <PrimaryLink href={`/library/books/${book.id}/copy`}>Add another copy</PrimaryLink>}
        <SecondaryLink href={`/library/books/${book.id}/edit`}>Correct the details</SecondaryLink>
      </div>

      <section className="mt-6" aria-labelledby="copies-title">
        <h2 id="copies-title" className="text-xl font-bold">
          Copies ({copies.length})
        </h2>
        <ul className="mt-3 space-y-2">
          {copies.map((c) => {
            const open = openOf.get(c.id);
            const status = statusWord(rows.get(c.id) ?? { status: "available", days_overdue: 0 });
            return (
            <li key={c.id}>
              <Link href={`/library/copies/${c.id}`} data-testid="copy-row" className="list-card">
                <span className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <span className="font-mono font-semibold text-icci-green">{c.label_serial}</span>
                    {c.copy_note && (
                      <span className="block text-sm" dir="auto">
                        {c.copy_note}
                      </span>
                    )}
                    {open && (
                      <span className="block text-sm" dir="auto">
                        {borrowers.get(open.borrower_id)?.full_name}, due {formatDate(open.due_on)}
                      </span>
                    )}
                  </span>
                  <StatusBadge word={status.word} tone={status.tone} />
                </span>
              </Link>
            </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6" aria-labelledby="loans-title">
        <h2 id="loans-title" className="text-xl font-bold">
          Loan history ({loans.length})
        </h2>
        {loans.length === 0 ? (
          <p className="mt-2">No copy of this book has been lent yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {loans.map((l) => {
              const o = loanOutcome(l);
              return (
                <li key={l.id} data-testid="loan-row" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-icci-line bg-white px-4 py-3">
                  <span>
                    <Link href={`/library/borrowers/${l.borrower_id}`} className="font-semibold" dir="auto">
                      {borrowers.get(l.borrower_id)?.full_name ?? "Borrower"}
                    </Link>
                    <span className="block text-sm">
                      <span className="font-mono">{labelOf.get(l.copy_id)}</span> · {formatDate(l.lent_on)} to{" "}
                      {l.returned_on ? formatDate(l.returned_on) : `due ${formatDate(l.due_on)}`}
                    </span>
                  </span>
                  <StatusBadge word={o.word} tone={o.tone} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
