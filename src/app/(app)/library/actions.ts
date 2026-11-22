"use server";
// What happens when the library forms are sent (slice P4.2). Runs on the web
// server as the signed-in person: the database's rules decide what is
// allowed (who may use the library, labels on one item or copy only, a
// correct ISBN, one book per ISBN, nothing deleted).
import { redirect } from "next/navigation";
import { parseLabelNumber } from "@/lib/items/rules";
import { friendlyLibraryError, parseBookForm, parseCopyNote } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { UUID, formGetter } from "@/lib/forms";

/**
 * After a refusal the form is drawn again with what was typed (values), so
 * nothing has to be typed twice; attempt makes the form start afresh.
 */
export type LibraryFormState = { error: string | null; values?: Record<string, string>; attempt?: number };

function refused(form: FormData, state: LibraryFormState, error: string): LibraryFormState {
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  return { error, values, attempt: (state.attempt ?? 0) + 1 };
}

function labelFrom(get: (name: string) => string): string | null {
  return parseLabelNumber(get("label"));
}

/** Add a book: a new book record and its first copy, saved together. */
export async function addBook(state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const get = formGetter(form);
  const label = labelFrom(get);
  if (!label) return refused(form, state, "Please scan the book's label, or type the number printed on it (for example ICCI-000123).");
  const book = parseBookForm(get);
  if (!book.ok) return refused(form, state, book.error);
  const note = parseCopyNote(get("copy_note"));
  if (!note.ok) return refused(form, state, note.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_book_and_copy", {
    p_label: label,
    p_title: book.values.title,
    p_author: book.values.author,
    p_isbn: book.values.isbn,
    p_publisher: book.values.publisher,
    p_year: book.values.published_year,
    p_language: book.values.language,
    p_copy_note: note.values,
    // Looked up from the ISBN on Open Library (slice P4.3), then checked.
    p_entered_by: get("entered_by") === "looked_up" ? "looked_up" : "typed",
  });
  if (error) return refused(form, state, friendlyLibraryError(error.message));
  redirect(`/library/books/${(data as { book_id: string }).book_id}?done=added`);
}

/** Another copy of a book we have: one more copy, with its own label. */
export async function addCopy(bookId: string, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(bookId)) return refused(form, state, "This book could not be found.");
  const get = formGetter(form);
  const label = labelFrom(get);
  if (!label) return refused(form, state, "Please scan the new copy's label, or type the number printed on it (for example ICCI-000123).");
  const note = parseCopyNote(get("copy_note"));
  if (!note.ok) return refused(form, state, note.error);
  const supabase = await createClient();
  const { error } = await supabase.from("library_copies").insert({ book_id: bookId, label_serial: label, copy_note: note.values });
  if (error) return refused(form, state, friendlyLibraryError(error.message));
  redirect(`/library/books/${bookId}?done=copy-added`);
}

/** Correct a book's details. The audit log keeps what it said before. */
export async function saveBook(bookId: string, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(bookId)) return refused(form, state, "This book could not be found.");
  const book = parseBookForm(formGetter(form));
  if (!book.ok) return refused(form, state, book.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("library_books").update(book.values).eq("id", bookId).select("id");
  if (error) return refused(form, state, friendlyLibraryError(error.message));
  if (!data?.length) return refused(form, state, "Your account is not allowed to do this.");
  redirect(`/library/books/${bookId}?done=saved`);
}

/** Change a copy's short note (the only thing about a copy that can change). */
export async function saveCopyNote(copyId: string, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(copyId)) return refused(form, state, "This copy could not be found.");
  const note = parseCopyNote(formGetter(form)("copy_note"));
  if (!note.ok) return refused(form, state, note.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("library_copies").update({ copy_note: note.values }).eq("id", copyId).select("id");
  if (error) return refused(form, state, friendlyLibraryError(error.message));
  if (!data?.length) return refused(form, state, "Your account is not allowed to do this.");
  redirect(`/library/copies/${copyId}?done=note-saved`);
}
