// "On loan" list (slice P4.5): Every book that is out, soonest due first.
// Designed for a PC first. CSV download for a Super Admin or Centre Admin only.
// A5: ?due=3 shows only the books due back in the next 3 days (the
// overview's "See all" under "Due back in the next 3 days").
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { addDays, todayInDublin } from "@/lib/vetting/rules";
import { mayDownloadLibraryCsv } from "@/lib/library/lists";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { loadBorrowers, loadCopyList } from "../data";
import { CsvButton, LoanTable } from "../list-parts";
import { BackLink, CannotSee, Skeleton } from "@/components/ui";
import { DeskTabs } from "../desk-tabs";

export const metadata: Metadata = { title: "On Loan | ICCI Control Dashboard" };

export default function Page(props: PageProps<"/library/on-loan">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <DeskTabs />
      <BackLink href="/library">Library</BackLink>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">On loan</h1>
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/library/on-loan">, "searchParams">) {
  const soonOnly = (await searchParams).due === "3";
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSee area="library" />;
  const supabase = await createClient();
  const all = await loadCopyList(supabase, ["on_loan", "overdue"], [{ column: "due_on", ascending: true }, { column: "title", ascending: true }]);
  const soon = addDays(todayInDublin(), 3);
  const rows = soonOnly ? all.filter((r) => r.status === "on_loan" && r.due_on && r.due_on <= soon) : all;
  const borrowers = await loadBorrowers(supabase, rows.flatMap((r) => (r.borrower_id ? [r.borrower_id] : [])));
  return (
    <>
      {soonOnly ? (
        <p className="mt-2" data-testid="due-soon-only">
          Only the books due back in the next 3 days.{" "}
          <Link href="/library/on-loan" className="font-semibold">
            Show every book on loan
          </Link>
        </p>
      ) : (
        <p className="mt-2">Every book that is out, soonest due first.</p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="list-count">
          {rows.length === 0 ? (soonOnly ? "Nothing is due back in the next 3 days." : "No book is on loan.") : `${rows.length} ${rows.length === 1 ? "book" : "books"}`}
        </p>
        {mayDownloadLibraryCsv(me.roleCode) && <CsvButton href="/library/on-loan/csv" />}
      </div>
      {rows.length > 0 && <LoanTable rows={rows} borrowers={borrowers} showContact={soonOnly} />}
    </>
  );
}
