// Slice P4.5: the plain rules behind the library lists, counters and CSV files.
import { describe, expect, it } from "vitest";
import {
  libraryCards,
  libraryFileName,
  lostCsv,
  mayDownloadLibraryCsv,
  mostBorrowedCsv,
  onLoanCsv,
  periodQuery,
  readPeriod,
  statusWord,
  type CopyRow,
  type CsvCopyRow,
} from "@/lib/library/lists";

const row = (extra: Partial<CopyRow> = {}): CopyRow => ({
  id: "c1",
  book_id: "b1",
  label_serial: "ICCI-000301",
  title: "Test Book One",
  author: "Test Author",
  status: "on_loan",
  flagged_on: null,
  loan_id: 1,
  borrower_id: "p1",
  lent_on: "2026-11-01",
  due_on: "2026-11-22",
  days_overdue: 0,
  ...extra,
});

describe("a copy's status in words", () => {
  it("uses the owner's colours", () => {
    expect(statusWord({ status: "available", days_overdue: 0 })).toEqual({ word: "Available", tone: "green" });
    expect(statusWord({ status: "on_loan", days_overdue: 0 })).toEqual({ word: "On loan", tone: "amber" });
    expect(statusWord({ status: "overdue", days_overdue: 1 })).toEqual({ word: "Overdue 1 day", tone: "red" });
    expect(statusWord({ status: "overdue", days_overdue: 8 })).toEqual({ word: "Overdue 8 days", tone: "red" });
    expect(statusWord({ status: "lost", days_overdue: 0 })).toEqual({ word: "Lost", tone: "red" });
    expect(statusWord({ status: "withdrawn", days_overdue: 0 })).toEqual({ word: "Withdrawn", tone: "grey" });
  });
});

describe("who may download a list", () => {
  it("admins only, never the Library Operator or Finance", () => {
    expect(mayDownloadLibraryCsv("super_admin")).toBe(true);
    expect(mayDownloadLibraryCsv("centre_admin")).toBe(true);
    expect(mayDownloadLibraryCsv("library_operator")).toBe(false);
    expect(mayDownloadLibraryCsv("finance")).toBe(false);
  });
});

describe("the Home card", () => {
  const card = (c: Partial<{ books_overdue: number; due_soon: number }>) =>
    libraryCards({ books_overdue: 0, due_soon: 0, books_on_loan: 4, copies_lost: 0, ...c })[0];
  it("is red with books overdue, and opens the Overdue list", () => {
    const c = card({ books_overdue: 3, due_soon: 2 });
    expect(c.tone).toBe("red");
    expect(c.count).toBe(3);
    expect(c.href).toBe("/library/overdue");
    expect(c.detail).toMatch(/2 more are due in the next 3 days/);
  });
  it("is amber when books are only due in the next three days", () => {
    const c = card({ due_soon: 1 });
    expect(c.tone).toBe("amber");
    expect(c.count).toBe(1);
    expect(c.detail).toMatch(/1 is due in the next 3 days/);
  });
  it("is green and says all clear at zero", () => {
    const c = card({});
    expect(c.tone).toBe("green");
    expect(c.count).toBe(0);
    expect(c.detail).toMatch(/All clear/);
  });
});

describe("the Most borrowed period", () => {
  const today = "2026-11-19";
  it("is the last 12 months unless another is chosen", () => {
    expect(readPeriod({}, today)).toMatchObject({ key: "12m", since: "2025-11-19", until: null });
    expect(readPeriod({ period: "nonsense" }, today).key).toBe("12m");
  });
  it("can be shorter, or all time", () => {
    expect(readPeriod({ period: "3m" }, today).since).toBe("2026-08-20");
    expect(readPeriod({ period: "all" }, today).since).toBe("2000-01-01");
  });
  it("takes two chosen dates, and ignores a wrong pair", () => {
    const p = readPeriod({ period: "custom", from: "2026-01-01", to: "2026-03-31" }, today);
    expect(p).toMatchObject({ key: "custom", since: "2026-01-01", until: "2026-03-31" });
    expect(periodQuery(p)).toBe("?period=custom&from=2026-01-01&to=2026-03-31");
    expect(readPeriod({ period: "custom", from: "2026-05-01", to: "2026-03-31" }, today).key).toBe("12m");
    expect(readPeriod({ period: "custom", from: "soon" }, today).key).toBe("12m");
  });
});

describe("the CSV files", () => {
  it("name each file with the date", () => {
    expect(libraryFileName("overdue", new Date("2026-11-19T12:00:00Z"))).toBe("icci-library-overdue-2026-11-19.csv");
  });
  it("the on-loan file has the borrower, the contact and the days overdue", () => {
    const r: CsvCopyRow = { ...row({ days_overdue: 4, status: "overdue" }), borrower: { full_name: "Test Aisha Pageturner", contact_kind: "email", contact: "aisha@icci-prototype.test" } };
    const lines = onLoanCsv([r]).replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Label,Title,Author,Borrower,Contact,Lent,Due,Days overdue");
    expect(lines[1]).toBe("ICCI-000301,Test Book One,Test Author,Test Aisha Pageturner,aisha@icci-prototype.test,2026-11-01,2026-11-22,4");
  });
  it("a phone number or a name can never run as a spreadsheet formula", () => {
    const r: CsvCopyRow = { ...row(), title: "=1+1", borrower: { full_name: "Test Name", contact_kind: "phone", contact: "+353 00 000 0201" } };
    const body = onLoanCsv([r]);
    expect(body).toContain("'=1+1");
    expect(body).toContain("'+353 00 000 0201");
  });
  it("keeps Arabic as it is, with the marker Excel needs", () => {
    const body = mostBorrowedCsv([{ book_id: "b", title: "كتاب تجريبي", author: null, loans: 3 }]);
    expect(body.startsWith("﻿Title,Author,Times lent")).toBe(true);
    expect(body).toContain("كتاب تجريبي,,3");
  });
  it("the lost file says lost or withdrawn", () => {
    const body = lostCsv([row({ status: "lost", flagged_on: "2026-11-10" }), row({ status: "withdrawn", flagged_on: "2026-10-01" })]);
    expect(body).toContain("Lost,2026-11-10");
    expect(body).toContain("Withdrawn,2026-10-01");
  });
});
