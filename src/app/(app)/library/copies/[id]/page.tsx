// One copy: what a scanned book label opens (slices P4.2 and P4.4). Shows the
// book, the label, the status and the right big button: "Lend this book"
// when it is available, "Return this book" when it is on loan. Under it:
// move the due date, or "returned by mistake", and the copy's loan history.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DeskTabs } from "../../desk-tabs";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate } from "@/lib/items/rules";
import { days, loanOutcome, returnedMessage } from "@/lib/library/loans";
import { MARK_DONE, statusWord } from "@/lib/library/lists";
import { LANGUAGE_LABEL, mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayInDublin } from "@/lib/vetting/rules";
import { loadBook, loadBorrowers, loadCopyRow, loadLoansOfCopies, UUID, type Copy } from "../../data";
import { CopyNoteForm } from "../../forms";
import { MarkCopyForm, MoveDueForm, ReturnForm, UndoReturnForm } from "../../loan-forms";
import { BackLink, CannotSee, PageNotice, PrimaryLink, SecondaryLink, Skeleton, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Library Copy | ICCI Control Dashboard" };

const LOST_HELP = "If the book cannot be found, mark it lost. A book on loan that is marked lost is no longer counted as out with the borrower. If it turns up, mark it found.";

const DONE: Record<string, string> = {
  "note-saved": "Note saved.",
  lent: "Lent. The due date is shown below.",
  moved: "Due date moved. The first due date stays in the loan's history.",
  undone: "Return cancelled: the book is on loan again. The mistaken return stays in the history.",
  ...MARK_DONE,
};

export default function CopyPage(props: PageProps<"/library/copies/[id]">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      {/* A5: the desk tabs, as on every other library desk page. */}
      <DeskTabs />
      <BackLink href="/library">Library</BackLink>
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/library/copies/[id]">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSee area="library" />;
  const { id } = await params;
  const { done, late } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("library_copies").select("id, book_id, label_serial, copy_note, created_at").eq("id", id).maybeSingle();
  if (!data) notFound();
  const copy = data as Copy;
  const book = await loadBook(supabase, copy.book_id);
  if (!book) notFound();
  const loans = await loadLoansOfCopies(supabase, [copy.id]);
  const borrowers = await loadBorrowers(supabase, loans.map((l) => l.borrower_id));
  const open = loans.find((l) => l.is_open) ?? null;
  const latest = loans[0];
  const row = await loadCopyRow(supabase, copy.id);
  const state = row?.status ?? "available";
  const status = statusWord(row ?? { status: "available", days_overdue: 0 });
  const today = todayInDublin();
  const max = addDays(today, 365);
  const notice = done === "returned" ? returnedMessage(Number(late) || 0) : typeof done === "string" ? DONE[done] : undefined;

  return (
    <>
      <p className="mt-2 font-mono text-sm font-semibold text-icci-ink-60" data-testid="copy-label">
        {copy.label_serial}
      </p>
      <h1 className="page-title text-[28px] md:text-[34px]" dir="auto">
        {book.title}
      </h1>
      <p className="mt-1 text-lg" dir="auto">
        {book.author ?? "Author not recorded"}
      </p>
      {notice && (
        <PageNotice floating testId="notice">{notice}</PageNotice>
      )}
      <div className="mt-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">Status</span>
          <span data-testid="copy-status">
            <StatusBadge word={status.word} tone={status.tone} />
          </span>
        </div>

        {state === "lost" || state === "withdrawn" ? (
          <div className="mt-4 space-y-4">
            <p className="rounded-xl bg-icci-panel px-4 py-3 text-[15px]" data-testid="copy-flag">
              {state === "lost"
                ? `Marked lost on ${formatDate(row?.flagged_on ?? null)}. It cannot be lent unless it is found.`
                : `Withdrawn from the library on ${formatDate(row?.flagged_on ?? null)}. This cannot be undone.`}
            </p>
            {state === "lost" && (
              <>
                <MarkCopyForm copyId={copy.id} kind="found" />
                <details className="rounded-xl border border-icci-line px-4 py-2">
                  <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Not coming back? Withdraw it</summary>
                  <div className="space-y-3 pb-3 pt-2">
                    <p className="text-[15px]">Withdrawing takes this copy out of the library for good. It can never be lent again.</p>
                    <MarkCopyForm copyId={copy.id} kind="withdrawn" />
                  </div>
                </details>
              </>
            )}
          </div>
        ) : open ? (
          <div className="mt-4 space-y-4">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-[15px]">
              <dt className="font-semibold text-icci-ink-60">Borrower</dt>
              <dd dir="auto" data-testid="loan-borrower">
                <Link href={`/library/borrowers/${open.borrower_id}`}>{borrowers.get(open.borrower_id)?.full_name ?? "Not found"}</Link>
              </dd>
              <dt className="font-semibold text-icci-ink-60">Lent</dt>
              <dd>{formatDate(open.lent_on)}</dd>
              <dt className="font-semibold text-icci-ink-60">Due back</dt>
              <dd data-testid="loan-due">
                {formatDate(open.due_on)}
                {open.days_overdue > 0 && <span className="font-semibold text-[var(--icci-bad-text)]"> ({days(open.days_overdue)} late)</span>}
              </dd>
            </dl>
            <ReturnForm copyId={copy.id} />
            <details className="rounded-xl border border-icci-line px-4 py-2">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Move the due date</summary>
              <div className="pb-3 pt-2">
                <MoveDueForm copyId={copy.id} loanId={open.id} due={open.due_on < today ? addDays(today, 7) : open.due_on} today={today} max={max} />
              </div>
            </details>
            <details className="rounded-xl border border-icci-line px-4 py-2">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Lost or no longer wanted?</summary>
              <div className="space-y-4 pb-3 pt-2">
                <p className="text-[15px]">{LOST_HELP}</p>
                <MarkCopyForm copyId={copy.id} kind="lost" />
                {!open && (
                  <>
                    <p className="text-[15px]">Withdrawing takes the copy out of the library for good. It can never be lent again.</p>
                    <MarkCopyForm copyId={copy.id} kind="withdrawn" />
                  </>
                )}
              </div>
            </details>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {book.active ? (
              <PrimaryLink href={`/library/copies/${copy.id}/lend`}>Lend this book</PrimaryLink>
            ) : (
              <p className="rounded-xl bg-icci-panel px-4 py-3 text-[15px]">This book is switched off, so it cannot be lent.</p>
            )}
            {latest && !latest.is_open && latest.returned_on && (
              <details className="rounded-xl border border-icci-line px-4 py-2">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Returned by mistake?</summary>
                <div className="space-y-3 pb-3 pt-2">
                  <p className="text-[15px]">
                    Last returned on {formatDate(latest.returned_on)} by{" "}
                    <span dir="auto">{borrowers.get(latest.borrower_id)?.full_name ?? "a borrower"}</span>. If the book did not really
                    come back, put the loan back on.
                  </p>
                  <UndoReturnForm copyId={copy.id} loanId={latest.id} />
                </div>
              </details>
            )}
            <details className="rounded-xl border border-icci-line px-4 py-2">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Lost or no longer wanted?</summary>
              <div className="space-y-4 pb-3 pt-2">
                <p className="text-[15px]">{LOST_HELP}</p>
                <MarkCopyForm copyId={copy.id} kind="lost" />
                {!open && (
                  <>
                    <p className="text-[15px]">Withdrawing takes the copy out of the library for good. It can never be lent again.</p>
                    <MarkCopyForm copyId={copy.id} kind="withdrawn" />
                  </>
                )}
              </div>
            </details>
          </div>
        )}

        <p className="mt-4 text-sm">
          {LANGUAGE_LABEL[book.language]} · added {formatDate(copy.created_at.slice(0, 10))}
        </p>
        <CopyNoteForm copyId={copy.id} note={copy.copy_note} />
      </div>

      <section className="mt-6" aria-labelledby="history-title">
        <h2 id="history-title" className="text-xl font-bold">
          Loan history ({loans.length})
        </h2>
        {loans.length === 0 ? (
          <p className="mt-2">This copy has not been lent yet.</p>
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
                      {formatDate(l.lent_on)} to {l.returned_on ? formatDate(l.returned_on) : `due ${formatDate(l.due_on)}`}
                    </span>
                  </span>
                  <StatusBadge word={o.word} tone={o.tone} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-4">
        <SecondaryLink href={`/library/books/${book.id}`}>See the book and its other copies</SecondaryLink>
      </div>
    </>
  );
}
