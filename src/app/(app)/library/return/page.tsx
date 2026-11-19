// Return a Book (slice P4.4): scan the book's label with the phone's Camera app
// (it opens the book's page), or type the label number here.
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { mayUseLibrary } from "@/lib/library/rules";
import { CannotSeeLibrary } from "../cannot-see";
import { FindCopyForm } from "../loan-forms";

export const metadata: Metadata = { title: "Return a Book | ICCI Control Dashboard" };

export default function ReturnPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Return a Book</h1>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSeeLibrary />;
  return (
    <>
      <ol className="mt-3 list-decimal space-y-1 ps-5">
        <li>Scan the label inside the book with the phone&apos;s Camera app, or type the number below.</li>
        <li>Then tap “Return this book”. Late returns show how many days late, for information only: there are no fines.</li>
      </ol>
      <FindCopyForm purpose="return" />
    </>
  );
}
