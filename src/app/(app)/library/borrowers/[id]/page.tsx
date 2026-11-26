// One borrower (slice P4.4): name, contact, books out now and past loans;
// "Correct the details" and "Switch off" (only with nothing on loan).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate } from "@/lib/items/rules";
import { CONTACT_KIND_LABEL, days, loanOutcome, MAX_BOOKS_OUT } from "@/lib/library/loans";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { loadBorrower, loadCopyTitles, loadLoansOfBorrower } from "../../data";
import { ContactLink } from "../../list-parts";
import { SwitchBorrowerForm } from "../../loan-forms";
import { BackLink, CannotSee, PageNotice, SecondaryLink, Skeleton, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Borrower | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Borrower added.",
  saved: "Changes saved. The earlier details stay in the record’s history.",
  off: "Switched off. They stay in the records with their past loans.",
  on: "Switched back on.",
};

export default function BorrowerPage(props: PageProps<"/library/borrowers/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <BackLink href="/library/borrowers">Borrowers</BackLink>
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/library/borrowers/[id]">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSee area="library" />;
  const { id } = await params;
  const { done } = await searchParams;
  const supabase = await createClient();
  const b = await loadBorrower(supabase, id);
  if (!b) notFound();
  const loans = await loadLoansOfBorrower(supabase, b.id);
  const titles = await loadCopyTitles(supabase, loans.map((l) => l.copy_id));
  const out = loans.filter((l) => l.is_open);
  const past = loans.filter((l) => !l.is_open);

  const row = (l: (typeof loans)[number]) => {
    const o = loanOutcome(l);
    const t = titles.get(l.copy_id);
    return (
      <li key={l.id} data-testid={l.is_open ? "out-row" : "past-row"} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-icci-line bg-white px-4 py-3">
        <span>
          <Link href={`/library/copies/${l.copy_id}`} className="font-semibold" dir="auto">
            {t?.title ?? "Book"}
          </Link>
          <span className="block text-sm">
            <span className="font-mono">{t?.label_serial}</span> · lent {formatDate(l.lent_on)} ·{" "}
            {l.returned_on ? `returned ${formatDate(l.returned_on)}` : `due ${formatDate(l.due_on)}`}
            {l.days_overdue > 0 && ` (${days(l.days_overdue)} late)`}
          </span>
        </span>
        <StatusBadge word={o.word} tone={o.tone} />
      </li>
    );
  };

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]" dir="auto">
          {b.full_name}
        </h1>
        {!b.active && <StatusBadge word="Switched off" tone="grey" />}
      </div>
      {typeof done === "string" && DONE[done] && (
        <PageNotice floating testId="notice">{DONE[done]}</PageNotice>
      )}
      <dl className="mt-4 grid gap-x-6 gap-y-3 rounded-2xl border border-icci-line bg-white p-5 shadow-card sm:grid-cols-[10rem_1fr]">
        <dt className="text-sm font-semibold text-icci-ink-60">{CONTACT_KIND_LABEL[b.contact_kind]}</dt>
        <dd data-testid="borrower-contact">
          <ContactLink b={b} />
        </dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Books out</dt>
        <dd data-testid="borrower-out">
          {out.length} of {MAX_BOOKS_OUT}
        </dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Added</dt>
        <dd>{formatDate(b.created_at.slice(0, 10))}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <SecondaryLink href={`/library/borrowers/${b.id}/edit`}>Correct the details</SecondaryLink>
        {(out.length === 0 || !b.active) && <SwitchBorrowerForm borrowerId={b.id} active={b.active} />}
      </div>
      {b.active && out.length > 0 && <p className="mt-2 text-sm">A borrower can be switched off once all their books are back.</p>}

      <section className="mt-6" aria-labelledby="out-title">
        <h2 id="out-title" className="text-xl font-bold">
          Books out now ({out.length})
        </h2>
        {out.length === 0 ? <p className="mt-2">None.</p> : <ul className="mt-3 space-y-2">{out.map(row)}</ul>}
      </section>
      <section className="mt-6" aria-labelledby="past-title">
        <h2 id="past-title" className="text-xl font-bold">
          Past loans ({past.length})
        </h2>
        {past.length === 0 ? <p className="mt-2">None yet.</p> : <ul className="mt-3 space-y-2">{past.map(row)}</ul>}
      </section>
    </>
  );
}
