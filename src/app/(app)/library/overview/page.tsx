// UI-9: "Library overview": a calm summary for the admins before any book
// list. Four numbers (titles and copies, on loan, overdue, lost and
// withdrawn), then only the exceptions: overdue returns, books due back in
// the next 3 days, and copies lately lost or withdrawn, five of each with
// "See all". Every number comes from the database's own library views, read
// as the signed-in person (its rules apply). Super Admin, Centre Admin and
// the Library Operator; Finance sees the usual note.
import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, ArrowRight, BookMarked, BookX, Library, type LucideIcon } from "lucide-react";
import { Suspense } from "react";
import { HeadlineCard, Skeleton, type HeadlineTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import type { Counters } from "@/lib/library/lists";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayInDublin } from "@/lib/vetting/rules";
import { CannotSeeLibrary } from "../cannot-see";
import { loadBorrowers, loadCopyList } from "../data";
import { FlaggedList, LoanTable } from "../list-parts";

export const metadata: Metadata = { title: "Library Overview | ICCI Control Dashboard" };

/** How many of each exception the overview shows before "See all". */
const SHOWN = 5;

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
      <h1 className="page-title text-[28px] md:text-[34px]">Library Overview</h1>
      <p className="mt-2">How the lending library stands today, and only what needs a phone call or a look.</p>
      <Suspense fallback={<div className="mt-6"><Skeleton lines={4} label="Loading the library" /></div>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSeeLibrary />;
  const supabase = await createClient();
  const today = todayInDublin();
  const soon = addDays(today, 3);

  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [counters, titles, copies, lostOrWithdrawn, overdue, onLoan, flagged] = await Promise.all([
    supabase.rpc("library_counters").single<Counters>(),
    count(supabase.from("library_book_list").select("id", { count: "exact", head: true }).eq("active", true)),
    count(supabase.from("library_copy_list").select("id", { count: "exact", head: true }).in("status", ["available", "on_loan", "overdue"])),
    count(supabase.from("library_copy_list").select("id", { count: "exact", head: true }).in("status", ["lost", "withdrawn"])),
    loadCopyList(supabase, ["overdue"], [{ column: "days_overdue", ascending: false }, { column: "title", ascending: true }]),
    loadCopyList(supabase, ["on_loan"], [{ column: "due_on", ascending: true }, { column: "title", ascending: true }]),
    loadCopyList(supabase, ["lost", "withdrawn"], [{ column: "flagged_on", ascending: false }, { column: "title", ascending: true }]),
  ]);
  const c = counters.data ?? { books_overdue: overdue.length, due_soon: 0, books_on_loan: onLoan.length + overdue.length, copies_lost: 0 };
  const dueSoon = onLoan.filter((r) => r.due_on && r.due_on <= soon);
  const borrowers = await loadBorrowers(supabase, [...overdue, ...dueSoon].flatMap((r) => (r.borrower_id ? [r.borrower_id] : [])));

  const cards: { label: string; count: number; icon: LucideIcon; tone: HeadlineTone; href: string; id: string }[] = [
    { id: "titles", label: `Titles · ${copies} ${copies === 1 ? "copy" : "copies"}`, count: titles, icon: Library, tone: "neutral", href: "/library" },
    { id: "on-loan", label: "Currently on loan", count: c.books_on_loan, icon: BookMarked, tone: "neutral", href: "/library/on-loan" },
    { id: "overdue", label: "Overdue returns", count: c.books_overdue, icon: AlarmClock, tone: c.books_overdue > 0 ? "red" : "neutral", href: "/library/overdue" },
    { id: "lost", label: "Lost and withdrawn", count: lostOrWithdrawn, icon: BookX, tone: lostOrWithdrawn > 0 ? "amber" : "neutral", href: "/library/lost" },
  ];

  return (
    <>
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="The library at a glance">
        {cards.map((k) => (
          <li key={k.id}>
            <HeadlineCard href={k.href} icon={k.icon} label={k.label} count={k.count} tone={k.tone} testId={`library-${k.id}`} />
          </li>
        ))}
      </ul>

      <Exceptions
        title="Overdue returns"
        empty="Nothing is overdue."
        total={overdue.length}
        seeAll="/library/overdue"
        testId="overview-overdue"
      >
        <LoanTable rows={overdue.slice(0, SHOWN)} borrowers={borrowers} showContact={true} />
      </Exceptions>

      <Exceptions
        title="Due back in the next 3 days"
        empty="Nothing is due back in the next 3 days."
        total={dueSoon.length}
        seeAll="/library/on-loan?due=3"
        testId="overview-due-soon"
      >
        <LoanTable rows={dueSoon.slice(0, SHOWN)} borrowers={borrowers} showContact={true} />
      </Exceptions>

      <Exceptions title="Lately lost or withdrawn" empty="No copy is lost or withdrawn." total={flagged.length} seeAll="/library/lost" testId="overview-lost">
        <FlaggedList rows={flagged.slice(0, SHOWN)} />
      </Exceptions>
    </>
  );
}

function Exceptions({
  title,
  empty,
  total,
  seeAll,
  testId,
  children,
}: {
  title: string;
  empty: string;
  total: number;
  seeAll: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8" aria-label={title} data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-bold text-icci-green-dark">
          <span aria-hidden className="h-6 w-1 rounded-full bg-icci-gold" />
          {title}
          {total > 0 && <span className="rounded-full bg-icci-panel px-2.5 py-0.5 text-sm font-semibold">{total}</span>}
        </h2>
        {total > 0 && (
          <Link href={seeAll} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold no-underline hover:underline">
            {total > SHOWN ? `See all ${total}` : "See the list"}
            <ArrowRight aria-hidden size={16} />
          </Link>
        )}
      </div>
      {total > 0 ? children : <p className="mt-3 rounded-xl border border-icci-line bg-white px-4 py-3 text-icci-ink-60">{empty}</p>}
    </section>
  );
}
