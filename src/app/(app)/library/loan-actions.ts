"use server";
// What happens when the lending forms are sent (slice P4.4). Runs on the web
// server as the signed-in person: the database's rules decide what is
// allowed (one open loan per copy, at most 3 books per borrower, no lending
// to a switched-off borrower, dates in range, nothing changed or deleted).
import { redirect } from "next/navigation";
import { parseLabelNumber } from "@/lib/items/rules";
import type { MarkKind } from "@/lib/library/lists";
import { friendlyLoanError, parseBorrowerForm, parseDueDate } from "@/lib/library/loans";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import type { LibraryFormState } from "./actions";
import { UUID, formGetter } from "@/lib/forms";

function refused(form: FormData, state: LibraryFormState, error: string): LibraryFormState {
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  return { error, values, attempt: (state.attempt ?? 0) + 1 };
}

/** Lend or Return, with a typed label number: find the copy it is on. */
export async function findCopy(purpose: "lend" | "return", state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const label = parseLabelNumber(formGetter(form)("label"));
  if (!label) return refused(form, state, "Please type the number printed on the book's label, for example ICCI-000123.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("label_use", { p_serial: label });
  if (error) return refused(form, state, friendlyLoanError(error.message));
  const use = data as { use: string; copy_id: string | null };
  if (use.use === "book_copy" && use.copy_id) {
    redirect(purpose === "lend" ? `/library/copies/${use.copy_id}/lend` : `/library/copies/${use.copy_id}`);
  }
  if (use.use === "free") return refused(form, state, `${label} is not on a library book yet. Use “Add a book” to put it on one.`);
  if (use.use === "item") return refused(form, state, `${label} is on an item, not a library book.`);
  return refused(form, state, `${label} has never been printed. Check the number on the label.`);
}

/** Add a borrower on their own (not while lending). */
export async function addBorrower(state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const b = parseBorrowerForm(formGetter(form));
  if (!b.ok) return refused(form, state, b.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("library_borrowers").insert(b.values).select("id").single();
  if (error) return refused(form, state, friendlyLoanError(error.message));
  redirect(`/library/borrowers/${data.id}?done=added`);
}

/** Correct a borrower's name or contact. The audit log keeps the old values. */
export async function saveBorrower(borrowerId: string, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(borrowerId)) return refused(form, state, "This borrower could not be found.");
  const b = parseBorrowerForm(formGetter(form));
  if (!b.ok) return refused(form, state, b.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("library_borrowers").update(b.values).eq("id", borrowerId).select("id");
  if (error) return refused(form, state, friendlyLoanError(error.message));
  if (!data?.length) return refused(form, state, "Your account is not allowed to do this.");
  redirect(`/library/borrowers/${borrowerId}?done=saved`);
}

/** Switch a borrower off (only with nothing on loan) or back on. */
export async function setBorrowerActive(borrowerId: string, active: boolean, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(borrowerId)) return refused(form, state, "This borrower could not be found.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("library_borrowers").update({ active }).eq("id", borrowerId).select("id");
  if (error) return refused(form, state, friendlyLoanError(error.message));
  if (!data?.length) return refused(form, state, "Your account is not allowed to do this.");
  redirect(`/library/borrowers/${borrowerId}?done=${active ? "on" : "off"}`);
}

function dueFrom(form: FormData) {
  return parseDueDate(formGetter(form)("due_on"), todayInDublin());
}

/** Lend a copy to a borrower we have. */
export async function lendToBorrower(copyId: string, borrowerId: string, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(copyId) || !UUID.test(borrowerId)) return refused(form, state, "This book or borrower could not be found.");
  const due = dueFrom(form);
  if (!due.ok) return refused(form, state, due.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("lend_copy", { p_copy_id: copyId, p_borrower_id: borrowerId, p_due_on: due.values });
  if (error) return refused(form, state, friendlyLoanError(error.message));
  redirect(`/library/copies/${copyId}?done=lent`);
}

/** Lend a copy to someone new: the borrower and the loan are saved together. */
export async function lendToNewBorrower(copyId: string, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(copyId)) return refused(form, state, "This book could not be found.");
  const b = parseBorrowerForm(formGetter(form));
  if (!b.ok) return refused(form, state, b.error);
  const due = dueFrom(form);
  if (!due.ok) return refused(form, state, due.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("lend_copy_to_new_borrower", {
    p_copy_id: copyId,
    p_full_name: b.values.full_name,
    p_contact_kind: b.values.contact_kind,
    p_contact: b.values.contact,
    p_due_on: due.values,
  });
  if (error) return refused(form, state, friendlyLoanError(error.message));
  redirect(`/library/copies/${copyId}?done=lent`);
}

/** Return: one button. */
export async function returnCopy(copyId: string, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(copyId)) return refused(form, state, "This book could not be found.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("return_copy", { p_copy_id: copyId });
  if (error) return refused(form, state, friendlyLoanError(error.message));
  const late = (data as { days_late: number }).days_late ?? 0;
  redirect(`/library/copies/${copyId}?done=returned&late=${late}`);
}

/** Move the due date: a new entry, the first due date stays in the loan. */
export async function moveDueDate(copyId: string, loanId: number, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(copyId) || !Number.isInteger(loanId)) return refused(form, state, "This loan could not be found.");
  const due = dueFrom(form);
  if (!due.ok) return refused(form, state, due.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_due_date", { p_loan_id: loanId, p_due_on: due.values });
  if (error) return refused(form, state, friendlyLoanError(error.message));
  redirect(`/library/copies/${copyId}?done=moved`);
}

/** "Returned by mistake, still on loan": cancels the latest return. */
export async function undoReturn(copyId: string, loanId: number, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(copyId) || !Number.isInteger(loanId)) return refused(form, state, "This loan could not be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_return", { p_loan_id: loanId });
  if (error) return refused(form, state, friendlyLoanError(error.message));
  redirect(`/library/copies/${copyId}?done=undone`);
}

/** Mark a copy lost, withdrawn, or found again (a new entry; nothing is changed or deleted). */
export async function markCopy(copyId: string, kind: MarkKind, state: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  if (!UUID.test(copyId) || !["lost", "withdrawn", "found"].includes(kind)) return refused(form, state, "This book could not be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_copy", { p_copy_id: copyId, p_kind: kind });
  if (error) return refused(form, state, friendlyLoanError(error.message));
  redirect(`/library/copies/${copyId}?done=${kind}`);
}
