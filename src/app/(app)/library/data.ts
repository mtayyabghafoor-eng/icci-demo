// What the library screens read (slice P4.2). Reads as the signed-in person,
// so the database's own rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOAN_COLUMNS, type ContactKind, type LoanStatus } from "@/lib/library/loans";
import { COPY_COLUMNS, type CopyRow } from "@/lib/library/lists";
import type { Language } from "@/lib/library/rules";

export type Book = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  published_year: number | null;
  language: Language;
  active: boolean;
  created_at: string;
  entered_by: "typed" | "looked_up";
};
export type Copy = { id: string; book_id: string; label_serial: string; copy_note: string | null; created_at: string };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadBook(supabase: SupabaseClient, id: string): Promise<Book | null> {
  if (!UUID.test(id)) return null;
  const { data } = await supabase
    .from("library_books")
    .select("id, title, author, isbn, publisher, published_year, language, active, created_at, entered_by")
    .eq("id", id)
    .maybeSingle();
  return (data as Book | null) ?? null;
}

export async function loadCopies(supabase: SupabaseClient, bookId: string): Promise<Copy[]> {
  const { data } = await supabase
    .from("library_copies")
    .select("id, book_id, label_serial, copy_note, created_at")
    .eq("book_id", bookId)
    .order("label_serial");
  return (data ?? []) as Copy[];
}

// ---------------------------------------------------------------------------
// Slice P4.4: borrowers and loans.
export type Borrower = { id: string; full_name: string; contact_kind: ContactKind; contact: string; active: boolean; created_at: string };
export const BORROWER_COLUMNS = "id, full_name, contact_kind, contact, active, created_at";

export async function loadBorrower(supabase: SupabaseClient, id: string): Promise<Borrower | null> {
  if (!UUID.test(id)) return null;
  const { data } = await supabase.from("library_borrowers").select(BORROWER_COLUMNS).eq("id", id).maybeSingle();
  return (data as Borrower | null) ?? null;
}

export async function loadBorrowers(supabase: SupabaseClient, ids: string[]): Promise<Map<string, Borrower>> {
  if (!ids.length) return new Map();
  const { data } = await supabase.from("library_borrowers").select(BORROWER_COLUMNS).in("id", [...new Set(ids)]);
  return new Map(((data ?? []) as Borrower[]).map((b) => [b.id, b]));
}

/** Every loan of these copies, newest first. */
export async function loadLoansOfCopies(supabase: SupabaseClient, copyIds: string[]): Promise<LoanStatus[]> {
  if (!copyIds.length) return [];
  const { data } = await supabase.from("library_loan_status").select(LOAN_COLUMNS).in("copy_id", copyIds).order("id", { ascending: false });
  return (data ?? []) as LoanStatus[];
}

/** Every loan of one borrower, newest first. */
export async function loadLoansOfBorrower(supabase: SupabaseClient, borrowerId: string): Promise<LoanStatus[]> {
  const { data } = await supabase.from("library_loan_status").select(LOAN_COLUMNS).eq("borrower_id", borrowerId).order("id", { ascending: false });
  return (data ?? []) as LoanStatus[];
}

/** Each copy with its book's title, for loan lists. */
export async function loadCopyTitles(supabase: SupabaseClient, copyIds: string[]): Promise<Map<string, { label_serial: string; title: string; book_id: string }>> {
  if (!copyIds.length) return new Map();
  const { data: copies } = await supabase.from("library_copies").select("id, book_id, label_serial").in("id", [...new Set(copyIds)]);
  const rows = (copies ?? []) as { id: string; book_id: string; label_serial: string }[];
  const { data: books } = await supabase.from("library_books").select("id, title").in("id", [...new Set(rows.map((r) => r.book_id))]);
  const title = new Map(((books ?? []) as { id: string; title: string }[]).map((b) => [b.id, b.title]));
  return new Map(rows.map((r) => [r.id, { label_serial: r.label_serial, title: title.get(r.book_id) ?? "", book_id: r.book_id }]));
}

// ---------------------------------------------------------------------------
// Slice P4.5: each copy's status (available, on loan, overdue, lost, withdrawn).
export async function loadCopyRow(supabase: SupabaseClient, id: string): Promise<CopyRow | null> {
  if (!UUID.test(id)) return null;
  const { data } = await supabase.from("library_copy_list").select(COPY_COLUMNS).eq("id", id).maybeSingle();
  return (data as CopyRow | null) ?? null;
}

export async function loadCopyRows(supabase: SupabaseClient, ids: string[]): Promise<Map<string, CopyRow>> {
  if (!ids.length) return new Map();
  const { data } = await supabase.from("library_copy_list").select(COPY_COLUMNS).in("id", ids);
  return new Map(((data ?? []) as CopyRow[]).map((r) => [r.id, r]));
}

/** Copies with these statuses, for the lists (at most 1,000: the library is small). */
export async function loadCopyList(
  supabase: SupabaseClient,
  statuses: string[],
  order: { column: string; ascending: boolean }[],
): Promise<CopyRow[]> {
  let q = supabase.from("library_copy_list").select(COPY_COLUMNS).in("status", statuses);
  for (const o of order) q = q.order(o.column, { ascending: o.ascending });
  const { data } = await q.limit(1000);
  return (data ?? []) as CopyRow[];
}
