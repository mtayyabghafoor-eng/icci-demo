// Correct a borrower's name or contact (slice P4.4). The audit log keeps
// what it said before.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { loadBorrower } from "../../../data";
import { BorrowerForm } from "../../../loan-forms";
import { BackLink, CannotSee, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Correct a Borrower | ICCI Control Dashboard" };

export default function EditBorrowerPage(props: PageProps<"/library/borrowers/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: Pick<PageProps<"/library/borrowers/[id]/edit">, "params">) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSee area="library" />;
  const { id } = await params;
  const b = await loadBorrower(await createClient(), id);
  if (!b) notFound();
  return (
    <>
      <BackLink href={`/library/borrowers/${b.id}`}>Back to the borrower</BackLink>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Correct the Details</h1>
      <BorrowerForm borrower={b} />
    </>
  );
}
