// Add a book (slice P4.2), phone-first. Opened from a scanned label (the
// number is filled in) or from the menu (the number is typed). Two ways:
//   - a new book: first the ISBN (camera on Android, or typed), looked up on
//     Open Library (slice P4.3) to fill in the details for checking; or
//     "No ISBN" to type everything (Arabic titles included)
//   - another copy of a book we have: find the book, then add the copy
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { parseLabelNumber } from "@/lib/items/rules";
import { lookupIsbn } from "@/lib/library/lookup";
import { BOOK_COLUMNS, formatIsbn, LANGUAGE_LABEL, mayUseLibrary, normaliseIsbn, searchTerm, type BookRow } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeeLibrary } from "../cannot-see";
import { NewBookForm } from "../forms";
import { IsbnCamera } from "../isbn-camera";
import { BackLink } from "@/components/ui";
import { DeskTabs } from "../desk-tabs";

export const metadata: Metadata = { title: "Add a Book | ICCI Control Dashboard" };

export default function NewBookPage(props: PageProps<"/library/new">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <DeskTabs />
      <BackLink href="/library">Library</BackLink>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Add a Book</h1>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" data-testid="label-problem" className="mt-4 rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3">
      <span className="font-semibold text-icci-error">Problem: </span>
      {children}
    </p>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/library/new">["searchParams"] }) {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSeeLibrary />;
  const params = await searchParams;
  const label = parseLabelNumber(typeof params.label === "string" ? params.label : "") ?? "";
  const mode = params.mode === "copy" ? "copy" : "new";
  const supabase = await createClient();

  // A scanned label: check it is free before anything is typed.
  if (label) {
    const { data } = await supabase.rpc("label_use", { p_serial: label });
    const use = data as { use: string; copy_id: string | null } | null;
    if (use?.use === "book_copy" && use.copy_id) redirect(`/library/copies/${use.copy_id}`);
    if (use?.use === "item") return <Problem>Label {label} is already on one of the Centre&rsquo;s items. Use a new label for the book.</Problem>;
    if (use?.use === "unknown") return <Problem>{label} is not a label number on the list of printed labels. Check the number on the label.</Problem>;
  }
  const withLabel = (extra: string) => `/library/new?${[label ? `label=${label}` : "", extra].filter(Boolean).join("&")}`;

  return (
    <>
      <p className="mt-2">
        {label ? (
          <>
            Label <strong className="font-mono">{label}</strong> is free.
          </>
        ) : (
          "Each copy needs its own ICCI label. Stick a new label inside the front cover first."
        )}
      </p>
      <nav aria-label="Which kind" className="mt-4 grid grid-cols-2 gap-2">
        {(["new", "copy"] as const).map((m) => (
          <Link
            key={m}
            href={withLabel(m === "copy" ? "mode=copy" : "")}
            aria-current={mode === m ? "page" : undefined}
            className={`flex min-h-12 items-center justify-center rounded-xl border px-3 text-center font-semibold no-underline ${
              mode === m ? "border-icci-green-dark bg-icci-green-dark text-white!" : "border-[#c9d3cf] bg-white text-icci-green!"
            }`}
          >
            {m === "new" ? "A new book" : "Another copy of a book we have"}
          </Link>
        ))}
      </nav>
      {mode === "copy" ? (
        <FindBook label={label} q={searchTerm(typeof params.q === "string" ? params.q : "")} />
      ) : params.manual === "1" ? (
        <NewBookForm label={label} />
      ) : typeof params.isbn === "string" && params.isbn.trim() ? (
        <LookedUpBook label={label} typedIsbn={params.isbn} />
      ) : (
        <IsbnStep label={label} />
      )}
    </>
  );
}

/** "Another copy": find the book by title, author or ISBN, then add the copy. */
async function FindBook({ label, q }: { label: string; q: string }) {
  const supabase = await createClient();
  let books: BookRow[] = [];
  if (q) {
    const digits = q.replace(/[\s-]/g, "");
    const parts = [`title.ilike.*${q}*`, `author.ilike.*${q}*`];
    if (/^[0-9X]{3,13}$/i.test(digits)) parts.push(`isbn.ilike.*${digits}*`);
    const { data } = await supabase.from("library_book_list").select(BOOK_COLUMNS).eq("active", true).or(parts.join(",")).order("title").limit(20);
    books = (data ?? []) as BookRow[];
  }
  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card">
      <form role="search" aria-label="Find the book" className="space-y-3">
        <input type="hidden" name="mode" value="copy" />
        {label && <input type="hidden" name="label" value={label} />}
        <label className="block">
          <span className="font-semibold">Find the book</span>
          <span className="block text-sm">Type part of the title, the author or the ISBN.</span>
          <input
            name="q"
            defaultValue={q}
            dir="auto"
            required
            className="mt-1.5 block min-h-12 w-full rounded-xl border border-[#c9d3cf] bg-white px-3.5 py-2 text-lg transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green"
          />
        </label>
        <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] border border-icci-green/40 bg-white px-4 font-semibold text-icci-green hover:bg-icci-green-50">
          Find
        </button>
      </form>
      {q && books.length === 0 && (
        <p data-testid="no-match">
          No book matches &ldquo;{q}&rdquo;. <Link href={label ? `/library/new?label=${label}` : "/library/new"}>Add it as a new book</Link>.
        </p>
      )}
      {books.length > 0 && (
        <ul className="space-y-2" aria-label="Matching books">
          {books.map((b) => (
            <li key={b.id}>
              <Link href={`/library/books/${b.id}/copy${label ? `?label=${label}` : ""}`} data-testid="pick-book" className="list-card">
                <span className="block font-semibold text-icci-green" dir="auto">
                  {b.title}
                </span>
                <span className="block text-sm" dir="auto">
                  {b.author ?? "Author not recorded"} · {LANGUAGE_LABEL[b.language]} · {b.copies} {b.copies === 1 ? "copy" : "copies"} now
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Step 1 of a new book: the ISBN (scanned or typed), or "No ISBN". */
function IsbnStep({ label, problem }: { label: string; problem?: string }) {
  return (
    <div className="mt-4 space-y-4">
      <IsbnCamera label={label} />
      <form className="space-y-3 rounded-2xl border border-icci-line bg-white p-5 shadow-card" aria-label="Look up the ISBN">
        {label && <input type="hidden" name="label" value={label} />}
        <label className="block">
          <span className="font-semibold">ISBN</span>
          <span id="isbn_step_hint" className="block text-sm">
            The 13 digits under the barcode on the back cover (10 on older books).
          </span>
          <input
            name="isbn"
            required
            inputMode="numeric"
            maxLength={30}
            aria-describedby="isbn_step_hint"
            className="mt-1.5 block min-h-12 w-full rounded-xl border border-[#c9d3cf] bg-white px-3.5 py-2 font-mono text-lg transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green"
          />
        </label>
        {problem && (
          <p role="alert" data-testid="form-error" className="rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3 text-[15px]">
            <span className="font-bold text-icci-error">Problem: </span>
            {problem}
          </p>
        )}
        <button
          type="submit"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-icci-green-dark px-4 font-semibold text-white shadow-sm hover:bg-icci-green-900"
        >
          Look up
        </button>
        <p className="text-sm">
          Only the ISBN is sent to Open Library, a free public list of books. If it has the book, the details are filled in for you to check.
        </p>
      </form>
      <p>
        <Link href={label ? `/library/new?label=${label}&manual=1` : "/library/new?manual=1"} className="font-semibold">
          No ISBN? Type the details
        </Link>
        <span className="block text-sm">For example an older book, or one printed without a barcode.</span>
      </p>
    </div>
  );
}

const LOOKUP_NOTE: Record<"found" | "not_found" | "unavailable", string> = {
  found: "Found on Open Library. Check the details, pick the language, then add the book.",
  not_found: "Open Library does not have this ISBN. Please type the details.",
  unavailable: "The book list did not answer in time. Please type the details.",
};

/** Step 2 of a new book: the ISBN looked up, then the details to check. */
async function LookedUpBook({ label, typedIsbn }: { label: string; typedIsbn: string }) {
  const checked = normaliseIsbn(typedIsbn);
  if (!checked.ok || !checked.isbn) {
    return <IsbnStep label={label} problem="That ISBN does not look right. Check the digits under the barcode, or choose No ISBN." />;
  }
  const isbn = checked.isbn;

  // Already in the library: add another copy of it instead.
  const supabase = await createClient();
  const { data: have } = await supabase.from("library_book_list").select(BOOK_COLUMNS).eq("isbn", isbn).maybeSingle();
  const existing = have as BookRow | null;
  if (existing) {
    return (
      <div className="mt-4 space-y-3 rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="already-have">
        <p>
          ISBN <span className="font-mono">{formatIsbn(isbn)}</span> is already in the library:
        </p>
        <p className="text-lg font-semibold" dir="auto">
          {existing.title}
        </p>
        <p className="text-sm" dir="auto">
          {existing.author ?? "Author not recorded"} · {existing.copies} {existing.copies === 1 ? "copy" : "copies"} now
        </p>
        <Link
          href={`/library/books/${existing.id}/copy${label ? `?label=${label}` : ""}`}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-icci-green-dark px-4 font-semibold text-white! no-underline shadow-sm hover:bg-icci-green-900"
        >
          Add another copy of this book
        </Link>
      </div>
    );
  }

  const result = await lookupIsbn(isbn);
  const initial: Record<string, string> =
    result.status === "found"
      ? {
          isbn,
          title: result.details.title,
          author: result.details.author ?? "",
          publisher: result.details.publisher ?? "",
          year: result.details.year ? String(result.details.year) : "",
        }
      : { isbn };
  return (
    <>
      <p
        role="status"
        data-testid="lookup-result"
        className={`mt-4 rounded-xl border px-4 py-3 ${
          result.status === "found"
            ? "border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)]"
            : "border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)]"
        }`}
      >
        {LOOKUP_NOTE[result.status]}
      </p>
      <NewBookForm label={label} initial={initial} enteredBy={result.status === "found" ? "looked_up" : "typed"} />
      <p className="mt-3 text-sm">
        <Link href={label ? `/library/new?label=${label}` : "/library/new"}>Look up a different ISBN</Link>
      </p>
    </>
  );
}
