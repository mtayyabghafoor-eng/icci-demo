// Lend a Book (slice P4.4): scan the book's label with the phone's Camera app
// (it opens the book's page), or type the label number here.
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { mayUseLibrary } from "@/lib/library/rules";
import { FindCopyForm } from "../loan-forms";
import { DeskTabs } from "../desk-tabs";
import { CannotSee, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Lend a Book | ICCI Control Dashboard" };

export default function LendPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <DeskTabs />
      <h1 className="page-title text-[28px] md:text-[34px]">Lend a Book</h1>
      <Suspense fallback={<Skeleton />}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSee area="library" />;
  return (
    <>
      <ol className="mt-3 list-decimal space-y-1 ps-5">
        <li>Scan the label inside the book with the phone&apos;s Camera app, or type the number below.</li>
        <li>Then pick the borrower and confirm the due date (21 days, at most 3 books each).</li>
      </ol>
      <FindCopyForm purpose="lend" />
    </>
  );
}
