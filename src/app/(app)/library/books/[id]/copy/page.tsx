// Another copy of a book we have (slice P4.2): the new copy's label and an
// optional note. Reached from the book page or from "Add a book".
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { parseLabelNumber } from "@/lib/items/rules";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeeLibrary } from "../../../cannot-see";
import { loadBook } from "../../../data";
import { NewCopyForm } from "../../../forms";

export const metadata: Metadata = { title: "Add a Copy | ICCI Control Dashboard" };

export default function NewCopyPage(props: PageProps<"/library/books/[id]/copy">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/library/books/[id]/copy">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSeeLibrary />;
  const { id } = await params;
  const sp = await searchParams;
  const label = parseLabelNumber(typeof sp.label === "string" ? sp.label : "") ?? "";
  const book = await loadBook(await createClient(), id);
  if (!book) notFound();
  return (
    <>
      <p className="text-sm">
        <Link className="back-link" href={`/library/books/${book.id}`}>
          ← Back to the book
        </Link>
      </p>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Add a Copy</h1>
      <p className="mt-1">
        Another copy of <strong dir="auto">{book.title}</strong>
        {book.author ? (
          <>
            {" "}
            by <span dir="auto">{book.author}</span>
          </>
        ) : null}
        .
      </p>
      <NewCopyForm bookId={book.id} label={label} />
    </>
  );
}
