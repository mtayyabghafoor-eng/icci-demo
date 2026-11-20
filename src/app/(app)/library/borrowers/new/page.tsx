// Add a borrower on their own (slice P4.4). Lending to someone new can also
// add them in the same step, from the Lend screen.
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { mayUseLibrary } from "@/lib/library/rules";
import { CannotSeeLibrary } from "../../cannot-see";
import { BorrowerForm } from "../../loan-forms";
import { BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Add a Borrower | ICCI Control Dashboard" };

export default function NewBorrowerPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <BackLink href="/library/borrowers">Borrowers</BackLink>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Add a Borrower</h1>
      <p className="mt-1">A name and one way to contact them. Adults only: a child&apos;s book is lent to their parent.</p>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSeeLibrary />;
  return <BorrowerForm />;
}
