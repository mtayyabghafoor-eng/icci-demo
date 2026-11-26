// The Library list (slice P4.2): every book, with its author, language and
// how many copies the library has. Search by title, author or ISBN.
// Designed for a PC first; one card per book on a phone. Super Admin,
// Centre Admin and the Library Operator.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { BOOK_COLUMNS, formatIsbn, LANGUAGE_LABEL, mayUseLibrary, searchTerm, type BookRow } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { DeskTabs } from "./desk-tabs";
import { CannotSee, PrimaryLink, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Library | ICCI Control Dashboard" };

/** How many books one page shows. */
const SHOWN = 100;

export default function LibraryPage(props: PageProps<"/library">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <DeskTabs />
      <h1 className="page-title text-[28px] md:text-[34px]">Library</h1>
      <p className="mt-2">Every book in the lending library, and how many copies of each.</p>
      <Suspense fallback={<Skeleton />}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/library">["searchParams"] }) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSee area="library" />;
  const params = await searchParams;
  const q = searchTerm(typeof params.q === "string" ? params.q : "");
  const supabase = await createClient();
  let query = supabase.from("library_book_list").select(BOOK_COLUMNS, { count: "exact" }).eq("active", true);
  if (q) {
    const digits = q.replace(/[\s-]/g, "");
    const parts = [`title.ilike.*${q}*`, `author.ilike.*${q}*`];
    if (/^[0-9X]{3,13}$/i.test(digits)) parts.push(`isbn.ilike.*${digits}*`);
    query = query.or(parts.join(","));
  }
  const { data, count } = await query.order("title").limit(SHOWN);
  const books = (data ?? []) as BookRow[];
  const total = count ?? books.length;

  return (
    <>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <form role="search" aria-label="Search the library" className="flex w-full max-w-xl gap-2">
          <label className="flex-1">
            <span className="sr-only">Title, author or ISBN</span>
            <input
              name="q"
              defaultValue={q}
              dir="auto"
              placeholder="Title, author or ISBN"
              className="block min-h-11 w-full rounded-xl border border-icci-field bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green"
            />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-[10px] border border-icci-green/40 bg-white px-4 font-semibold text-icci-green hover:bg-icci-green-50">
            Search
          </button>
        </form>
        <PrimaryLink href="/library/new">Add a book</PrimaryLink>
      </div>
      <p className="mt-4 text-[15px] text-icci-ink-60" data-testid="book-count">
        {total === 0
          ? q
            ? `No book matches “${q}”.`
            : "No books yet."
          : `${total} ${total === 1 ? "book" : "books"}${q ? ` matching “${q}”` : ""}${total > SHOWN ? `, the first ${SHOWN} shown. Search to find others.` : ""}`}
      </p>
      {books.length > 0 && (
        <>
          <div className="list-table-wrap">
            <table className="list-table hidden md:table">
              <thead>
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Author</th>
                  <th className="px-3 py-2">Language</th>
                  <th className="px-3 py-2">ISBN</th>
                  <th className="px-3 py-2 text-right">Copies</th>
                </tr>
              </thead>
              <tbody>
                {books.map((b) => (
                  <tr key={b.id} data-testid="book-row" className="border-b border-icci-panel align-top">
                    <td className="px-3 py-2" dir="auto">
                      <Link href={`/library/books/${b.id}`} className="font-semibold">
                        {b.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2" dir="auto">
                      {b.author ?? "Not recorded"}
                    </td>
                    <td className="px-3 py-2">{LANGUAGE_LABEL[b.language]}</td>
                    <td className="px-3 py-2 font-mono text-sm whitespace-nowrap">{b.isbn ? formatIsbn(b.isbn) : "None"}</td>
                    <td className="px-3 py-2 text-right">{b.copies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-3 md:hidden">
            {books.map((b) => (
              <li key={b.id}>
                <Link href={`/library/books/${b.id}`} data-testid="book-row" className="list-card">
                  <span className="block font-semibold text-icci-green" dir="auto">
                    {b.title}
                  </span>
                  <span className="mt-1 block text-sm" dir="auto">
                    {b.author ?? "Author not recorded"}
                  </span>
                  <span className="mt-1 block text-sm">
                    {LANGUAGE_LABEL[b.language]} · {b.copies} {b.copies === 1 ? "copy" : "copies"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
