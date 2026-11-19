// Plain rules for borrowers, lending and returns (slice P4.4; docs/PHASE-4.md).
// The database enforces the same rules (migration 0037); these let a screen
// explain a mistake before anything is sent, and say a loan's status in words.
import type { Tone } from "@/lib/items/rules";
import { addDays, isDate } from "@/lib/vetting/rules";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

/** Owner's choices, 19 Nov 2026: 21 days, at most 3 books, no fines. */
export const LOAN_DAYS = 21;
export const MAX_BOOKS_OUT = 3;

export type ContactKind = "phone" | "email";
export const CONTACT_KIND_LABEL: Record<ContactKind, string> = { phone: "Phone", email: "Email" };

export type BorrowerValues = { full_name: string; contact_kind: ContactKind; contact: string };

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

/** The Add a borrower / Correct details form: a name and ONE contact detail. */
export function parseBorrowerForm(get: Get): Result<BorrowerValues> {
  const full_name = tidy(get("full_name"));
  const kind = get("contact_kind");
  let contact = tidy(get("contact"));
  if (!full_name) return { ok: false, error: "Please type the borrower's name." };
  if (full_name.length > 100) return { ok: false, error: "The name can be 100 characters at most." };
  if (kind !== "phone" && kind !== "email") return { ok: false, error: "Please choose phone or email." };
  if (!contact) return { ok: false, error: kind === "phone" ? "Please type a phone number." : "Please type an email address." };
  if (kind === "phone") {
    const digits = contact.replace(/[^0-9]/g, "").length;
    if (!/^\+?[0-9 ()-]+$/.test(contact) || digits < 7 || digits > 15) {
      return { ok: false, error: "That phone number does not look right. Use digits only, for example 087 123 4567." };
    }
  } else {
    contact = contact.toLowerCase();
    if (contact.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
      return { ok: false, error: "That email address does not look right. Check it has an @ and a full stop, for example name@example.ie." };
    }
  }
  return { ok: true, values: { full_name, contact_kind: kind, contact } };
}

/** The due date field: empty means the usual 21 days. */
export function parseDueDate(raw: string, today: string): Result<string> {
  const s = raw.trim();
  if (!isDate(s)) return { ok: false, error: "Please pick a due date." };
  if (s < today) return { ok: false, error: "The due date cannot be in the past." };
  if (s > addDays(today, 365)) return { ok: false, error: "The due date cannot be more than a year away." };
  return { ok: true, values: s };
}

/** One row of the database's library_loan_status view. */
export type LoanStatus = {
  id: number;
  copy_id: string;
  borrower_id: string;
  lent_on: string;
  first_due_on: string;
  due_on: string;
  is_open: boolean;
  returned_on: string | null;
  days_overdue: number;
  days_late: number;
  lost_on: string | null;
};
export const LOAN_COLUMNS = "id, copy_id, borrower_id, lent_on, first_due_on, due_on, is_open, returned_on, days_overdue, days_late, lost_on";

export function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/** A copy's status from its open loan (lost and withdrawn come in P4.5). */
export function copyStatus(open: LoanStatus | null | undefined): { word: string; tone: Tone } {
  if (!open) return { word: "Available", tone: "green" };
  if (open.days_overdue > 0) return { word: `Overdue ${days(open.days_overdue)}`, tone: "red" };
  return { word: "On loan", tone: "amber" };
}

/** What a finished or open loan says in a history list. */
export function loanOutcome(l: LoanStatus): { word: string; tone: Tone } {
  if (l.is_open) return copyStatus(l);
  if (l.lost_on) return { word: "Lost", tone: "red" };
  if (l.days_late > 0) return { word: `Returned ${days(l.days_late)} late`, tone: "grey" };
  return { word: "Returned", tone: "grey" };
}

/** What the person sees after a return (for information only: no fines). */
export function returnedMessage(daysLate: number): string {
  return daysLate > 0 ? `Returned. It was ${days(daysLate)} late (for information only: there are no fines).` : "Returned on time. The book is available again.";
}

export function friendlyLoanError(message: string | undefined): string {
  if (!message) return "That could not be saved. Please try again.";
  if (/row-level security|permission denied|42501|Only a Super Admin/i.test(message)) return "Your account is not allowed to do this.";
  // The database's own messages are already written in plain words.
  if (/borrower|loan|due date|phone|email|returned|return|lent|lost|withdrawn|found|copy|switched off|could not be found|books out|name|contact/i.test(message) && !/violates|constraint|syntax|column|function/i.test(message)) {
    return message;
  }
  return "That could not be saved. Please try again.";
}

/** Characters that would break the database search; dropped. */
export function nameSearch(raw: string): string {
  return raw.replace(/[%_,()*\\"]/g, " ").trim().replace(/\s+/g, " ").slice(0, 100);
}
