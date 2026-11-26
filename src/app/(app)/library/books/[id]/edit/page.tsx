// Correct a book's details (slice P4.2). The audit log keeps the old values.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { loadBook } from "../../../data";
import { EditBookForm } from "../../../forms";
import { BackLink, CannotSee, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Correct a Book | ICCI Control Dashboard" };

export default function EditBookPage(props: PageProps<"/library/books/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: Pick<PageProps<"/library/books/[id]/edit">, "params">) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSee area="library" />;
  const { id } = await params;
  const book = await loadBook(await createClient(), id);
  if (!book) notFound();
  return (
    <>
      <BackLink href={`/library/books/${book.id}`}>Back to the book</BackLink>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Correct the Details</h1>
      <p className="mt-1">Fix a spelling mistake or a missing detail. What it said before is kept in the record&rsquo;s history.</p>
      <EditBookForm book={book} />
    </>
  );
}
