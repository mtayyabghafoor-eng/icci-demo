// Plain rules for the library lists and counters (slice P4.5; docs/PHASE-4.md).
// The database works out each copy's status (view library_copy_list) and the
// counters (library_counters); this file turns them into words, CSV files
// and cards. Only a Super Admin or Centre Admin may download a CSV.
import { toCsv } from "@/lib/assets/lists";
import type { Tone } from "@/lib/items/rules";
import { addDays, isDate } from "@/lib/vetting/rules";
import { days } from "./loans";

export type CopyStatus = "available" | "on_loan" | "overdue" | "lost" | "withdrawn";

/** One row of the database's library_copy_list view. */
export type CopyRow = {
  id: string;
  book_id: string;
  label_serial: string;
  title: string;
  author: string | null;
  status: CopyStatus;
  flagged_on: string | null;
  loan_id: number | null;
  borrower_id: string | null;
  lent_on: string | null;
  due_on: string | null;
  days_overdue: number;
};
export const COPY_COLUMNS = "id, book_id, label_serial, title, author, status, flagged_on, loan_id, borrower_id, lent_on, due_on, days_overdue";

export type Counters = { books_overdue: number; due_soon: number; books_on_loan: number; copies_lost: number };

/** Only admins download files: the Library Operator does not (docs/PHASE-4.md 2). */
export const MAY_DOWNLOAD_LIBRARY_CSV = ["super_admin", "centre_admin"] as const;
export function mayDownloadLibraryCsv(roleCode: string): boolean {
  return (MAY_DOWNLOAD_LIBRARY_CSV as readonly string[]).includes(roleCode);
}

/** A copy's status in words, with its colour. */
export function statusWord(s: Pick<CopyRow, "status" | "days_overdue">): { word: string; tone: Tone } {
  switch (s.status) {
    case "available":
      return { word: "Available", tone: "green" };
    case "on_loan":
      return { word: "On loan", tone: "amber" };
    case "overdue":
      return { word: `Overdue ${days(s.days_overdue)}`, tone: "red" };
    case "lost":
      return { word: "Lost", tone: "red" };
    default:
      return { word: "Withdrawn", tone: "grey" };
  }
}

export type MarkKind = "lost" | "withdrawn" | "found";
export const MARK_DONE: Record<MarkKind, string> = {
  lost: "Marked lost. It cannot be lent unless it is found.",
  withdrawn: "Withdrawn from the library. It can no longer be lent.",
  found: "Found. The copy is available again.",
};

// ---------------------------------------------------------------------------
// Most borrowed: the period.
export type Period = { key: string; label: string; since: string; until: string | null };

export const PERIODS = [
  { key: "12m", label: "Last 12 months" },
  { key: "6m", label: "Last 6 months" },
  { key: "3m", label: "Last 3 months" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Choose dates" },
] as const;

/** The period from the address: a named one, or two chosen dates. */
export function readPeriod(params: Record<string, string | string[] | undefined>, today: string): Period {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const key = get("period");
  if (key === "custom") {
    const from = get("from");
    const to = get("to");
    if (isDate(from) && (!to || (isDate(to) && to >= from))) {
      return { key, label: to ? `${from} to ${to}` : `Since ${from}`, since: from, until: to || null };
    }
  }
  if (key === "6m") return { key, label: "Last 6 months", since: addDays(today, -183), until: null };
  if (key === "3m") return { key, label: "Last 3 months", since: addDays(today, -91), until: null };
  if (key === "all") return { key, label: "All time", since: "2000-01-01", until: null };
  return { key: "12m", label: "Last 12 months", since: addDays(today, -365), until: null };
}

/** The period as an address query, for the CSV link. */
export function periodQuery(p: Period): string {
  if (p.key === "custom") return `?period=custom&from=${p.since}${p.until ? `&to=${p.until}` : ""}`;
  return `?period=${p.key}`;
}

// ---------------------------------------------------------------------------
// The Home card.
export type LibraryCard = { id: string; title: string; count: number; detail: string; href: string; tone: Tone };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** D1: amber when any book is overdue or due in 3 days (a phone call, not an emergency), else green. */
export function libraryCards(c: Counters): LibraryCard[] {
  const tone: Tone = c.books_overdue > 0 || c.due_soon > 0 ? "amber" : "green";
  const detail =
    c.books_overdue > 0
      ? c.due_soon > 0
        ? `Overdue. ${plural(c.due_soon, "more is", "more are")} due in the next 3 days.`
        : "Overdue. Phone the borrowers."
      : c.due_soon > 0
        ? `None overdue. ${plural(c.due_soon, "is", "are")} due in the next 3 days.`
        : "All clear. Nothing is overdue or due soon.";
  return [
    {
      id: "library-overdue",
      title: "Library books overdue",
      count: c.books_overdue > 0 ? c.books_overdue : c.due_soon,
      detail,
      href: c.books_overdue > 0 ? "/library/overdue" : "/library/on-loan",
      tone,
    },
  ];
}

// ---------------------------------------------------------------------------
// CSV files.
export type CsvBorrower = { full_name: string; contact_kind: string; contact: string };
export type CsvCopyRow = CopyRow & { borrower: CsvBorrower | null };

const contactOf = (b: CsvBorrower | null) => (b ? b.contact : "");

export function onLoanCsv(rows: CsvCopyRow[]): string {
  return toCsv([
    ["Label", "Title", "Author", "Borrower", "Contact", "Lent", "Due", "Days overdue"],
    ...rows.map((r) => [r.label_serial, r.title, r.author ?? "", r.borrower?.full_name ?? "", contactOf(r.borrower), r.lent_on ?? "", r.due_on ?? "", String(r.days_overdue)]),
  ]);
}

export function lostCsv(rows: CopyRow[]): string {
  return toCsv([
    ["Label", "Title", "Author", "Status", "Since"],
    ...rows.map((r) => [r.label_serial, r.title, r.author ?? "", r.status === "lost" ? "Lost" : "Withdrawn", r.flagged_on ?? ""]),
  ]);
}

export type MostBorrowedRow = { book_id: string; title: string; author: string | null; loans: number };
export function mostBorrowedCsv(rows: MostBorrowedRow[]): string {
  return toCsv([["Title", "Author", "Times lent"], ...rows.map((r) => [r.title, r.author ?? "", String(r.loans)])]);
}

/** "icci-library-overdue-2026-11-19.csv" (the date in Dublin). */
export function libraryFileName(list: string, now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(now);
  return `icci-library-${list}-${day}.csv`;
}
