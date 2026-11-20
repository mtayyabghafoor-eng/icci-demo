// "On loan" list (slice P4.5): Every book that is out, soonest due first.
// Designed for a PC first. CSV download for a Super Admin or Centre Admin only.
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { mayDownloadLibraryCsv } from "@/lib/library/lists";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeeLibrary } from "../cannot-see";
import { loadBorrowers, loadCopyList } from "../data";
import { CsvButton, LoanTable } from "../list-parts";
import { BackLink } from "@/components/ui";
import { DeskTabs } from "../desk-tabs";

export const metadata: Metadata = { title: "On Loan | ICCI Control Dashboard" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <DeskTabs />
      <BackLink href="/library">Library</BackLink>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">On loan</h1>
      <p className="mt-2">Every book that is out, soonest due first.</p>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSeeLibrary />;
  const supabase = await createClient();
  const rows = await loadCopyList(supabase, ["on_loan", "overdue"], [{ column: "due_on", ascending: true }, { column: "title", ascending: true }]);
  const borrowers = await loadBorrowers(supabase, rows.flatMap((r) => (r.borrower_id ? [r.borrower_id] : [])));
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="list-count">
          {rows.length === 0 ? "No book is on loan." : `${rows.length} ${rows.length === 1 ? "book" : "books"}`}
        </p>
        {mayDownloadLibraryCsv(me.roleCode) && <CsvButton href="/library/on-loan/csv" />}
      </div>
      {rows.length > 0 && <LoanTable rows={rows} borrowers={borrowers} showContact={false} />}
    </>
  );
}
