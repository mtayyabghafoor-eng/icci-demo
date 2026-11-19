// Slice P4.4: plain rules for borrowers, lending and returns. The database
// enforces the same rules (migration 0037); these let the screens explain a
// mistake before anything is sent, and say a loan's status in words.
import { describe, expect, it } from "vitest";
import {
  copyStatus,
  friendlyLoanError,
  LOAN_DAYS,
  loanOutcome,
  MAX_BOOKS_OUT,
  parseBorrowerForm,
  parseDueDate,
  returnedMessage,
  type LoanStatus,
} from "@/lib/library/loans";

const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";

const loan = (extra: Partial<LoanStatus> = {}): LoanStatus => ({
  id: 1,
  copy_id: "c",
  borrower_id: "b",
  lent_on: "2026-11-01",
  first_due_on: "2026-11-22",
  due_on: "2026-11-22",
  is_open: true,
  returned_on: null,
  days_overdue: 0,
  days_late: 0,
  lost_on: null,
  ...extra,
});

describe("the owner's loan rules", () => {
  it("21 days, at most 3 books", () => {
    expect(LOAN_DAYS).toBe(21);
    expect(MAX_BOOKS_OUT).toBe(3);
  });
});

describe("a borrower: a name and one contact detail", () => {
  it("accepts a phone number and tidies spaces", () => {
    expect(parseBorrowerForm(form({ full_name: "  Test   Borrower ", contact_kind: "phone", contact: " +353 00 000 1234 " }))).toEqual({
      ok: true,
      values: { full_name: "Test Borrower", contact_kind: "phone", contact: "+353 00 000 1234" },
    });
  });

  it("accepts an email and keeps it in small letters", () => {
    const r = parseBorrowerForm(form({ full_name: "Test Borrower", contact_kind: "email", contact: "Test.B@icci-prototype.test" }));
    expect(r).toEqual({ ok: true, values: { full_name: "Test Borrower", contact_kind: "email", contact: "test.b@icci-prototype.test" } });
  });

  it("refuses a missing name, kind or contact, and a wrong phone or email", () => {
    const bad: Record<string, string>[] = [
      { contact_kind: "phone", contact: "0870000000" },
      { full_name: "Test", contact: "0870000000" },
      { full_name: "Test", contact_kind: "phone" },
      { full_name: "Test", contact_kind: "phone", contact: "call me" },
      { full_name: "Test", contact_kind: "phone", contact: "123" },
      { full_name: "Test", contact_kind: "email", contact: "no-at-sign" },
      { full_name: "Test", contact_kind: "address", contact: "Test street" },
    ];
    for (const v of bad) expect(parseBorrowerForm(form(v)).ok, JSON.stringify(v)).toBe(false);
  });
});

describe("the due date", () => {
  it("today up to a year away", () => {
    expect(parseDueDate("2026-11-19", "2026-11-19")).toEqual({ ok: true, values: "2026-11-19" });
    expect(parseDueDate("2027-11-19", "2026-11-19").ok).toBe(true);
    expect(parseDueDate("2026-11-18", "2026-11-19")).toEqual({ ok: false, error: "The due date cannot be in the past." });
    expect(parseDueDate("2027-11-20", "2026-11-19").ok).toBe(false);
    expect(parseDueDate("", "2026-11-19").ok).toBe(false);
    expect(parseDueDate("2026-02-30", "2026-01-01").ok).toBe(false);
  });
});

describe("status words (always a colour and a word)", () => {
  it("Available, On loan, Overdue", () => {
    expect(copyStatus(null)).toEqual({ word: "Available", tone: "green" });
    expect(copyStatus(loan())).toEqual({ word: "On loan", tone: "amber" });
    expect(copyStatus(loan({ days_overdue: 1 }))).toEqual({ word: "Overdue 1 day", tone: "red" });
    expect(copyStatus(loan({ days_overdue: 4 }))).toEqual({ word: "Overdue 4 days", tone: "red" });
  });

  it("a returned loan in the history", () => {
    expect(loanOutcome(loan({ is_open: false, returned_on: "2026-11-10" }))).toEqual({ word: "Returned", tone: "grey" });
    expect(loanOutcome(loan({ is_open: false, returned_on: "2026-11-25", days_late: 3 }))).toEqual({ word: "Returned 3 days late", tone: "grey" });
  });

  it("what a return says", () => {
    expect(returnedMessage(0)).toMatch(/on time/);
    expect(returnedMessage(2)).toMatch(/2 days late.*no fines/);
  });
});

describe("refusals in plain words", () => {
  it("passes on the database's own plain messages, hides technical ones", () => {
    expect(friendlyLoanError("This book is already on loan. Return it first.")).toBe("This book is already on loan. Return it first.");
    expect(friendlyLoanError("This borrower already has 3 books out, the most allowed. One must come back first.")).toMatch(/3 books/);
    expect(friendlyLoanError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyLoanError('null value in column "x" violates not-null constraint')).toBe("That could not be saved. Please try again.");
  });
});
