// The monthly file for the bookkeeper (slice P5.5; docs/PHASE-5.md section
// 7, owner approved 25 Nov 2026). One CSV file per month in three parts:
//   1. Claims approved this month, as they were approved.
//   2. Corrections approved this month, each as two lines: the old values
//      taken out (minus) and the new values put in (plus), so a change of
//      fund or category moves the money too.
//   3. Repayments recorded this month, and repayments withdrawn this month
//      (as a minus).
// Everything goes in the month it happened in Ireland, by the moment the
// database recorded it, so a month's file never changes once it is over.
import { csvCell } from "@/lib/assets/lists";
import { claimNumber, METHOD_LABEL, monthOf, PAYMENT_SHORT, type EntryRow, type RepayMethod } from "./claims";

export type ExportNames = {
  personName: (id: string | null) => string;
  accountName: (id: string | null) => string;
  categoryName: Map<string, string>;
  fundName: Map<string, string>;
  paidTo: (e: EntryRow) => string;
};

export type RepaymentRow = {
  id: number;
  person_id: string;
  paid_on: string;
  method: RepayMethod;
  reference: string | null;
  withdrawn_reason: string | null;
  withdrawn_at: string | null;
  created_at: string;
};
export type RepaymentLink = { repayment_id: number; claim_id: number; amount_cents: number };

export type ClaimLine = {
  id: number;
  receipt_date: string;
  approved_on: string;
  paid_to: string;
  description: string;
  category: string;
  fund: string;
  amount_cents: number;
  vat_cents: number | null;
  payment: string;
  paid_by: string;
  approved_by: string;
  second_by: string;
  receipt: string;
};

export type CorrectionLine = {
  claim: number;
  correction: number;
  line: "Taken out" | "Put in";
  approved_on: string;
  receipt_date: string;
  category: string;
  fund: string;
  amount_cents: number;
  vat_cents: number | null;
  reason: string;
};

export type RepaymentLine = {
  repayment: number;
  kind: "Paid" | "Withdrawn";
  paid_on: string;
  recorded_on: string;
  person: string;
  total_cents: number;
  method: string;
  reference: string;
  claims: string;
  note: string;
};

export type MonthExport = {
  month: string;
  claims: ClaimLine[];
  corrections: CorrectionLine[];
  repayments: RepaymentLine[];
  /** Approved spending this month (claims plus corrections), by fund and by category. */
  byFund: Map<string, number>;
  byCategory: Map<string, number>;
  total_cents: number;
  repaid_cents: number;
};

const dublinDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * Builds one month's three parts from every approved entry (claims and
 * corrections), their receipt file counts, and the repayments.
 */
export function buildMonthExport(
  month: string,
  entries: EntryRow[],
  fileCount: Map<number, number>,
  repayments: RepaymentRow[],
  links: RepaymentLink[],
  names: ExportNames,
): MonthExport {
  const approved = entries.filter((e) => e.state === "approved" && e.approved_at);
  const inMonth = (iso: string | null) => Boolean(iso) && monthOf(iso!) === month;
  const claimById = new Map(approved.filter((e) => e.kind === "claim").map((e) => [e.id, e]));
  const fund = (id: string | null) => (id ? (names.fundName.get(id) ?? "A fund") : "");
  const category = (id: string) => names.categoryName.get(id) ?? "A category";

  const claims: ClaimLine[] = approved
    .filter((e) => e.kind === "claim" && inMonth(e.approved_at))
    .sort((a, b) => a.id - b.id)
    .map((e) => ({
      id: e.id,
      receipt_date: e.receipt_date,
      approved_on: dublinDay(e.approved_at!),
      paid_to: names.paidTo(e),
      description: e.description,
      category: category(e.category_id),
      fund: fund(e.fund_id),
      amount_cents: e.amount_cents,
      vat_cents: e.vat_cents,
      payment: PAYMENT_SHORT[e.payment],
      paid_by: e.payment === "centre_direct" ? "" : names.personName(e.paid_by_person_id),
      approved_by: names.accountName(e.first_by),
      second_by: e.second_by ? names.accountName(e.second_by) : "",
      receipt: e.receipt_lost_reason ? "Lost" : `${fileCount.get(e.id) ?? 0} file${(fileCount.get(e.id) ?? 0) === 1 ? "" : "s"}`,
    }));

  // Each correction: the values just before it (the claim, or the previous approved correction) out, its own in.
  const corrections: CorrectionLine[] = [];
  const allCorrections = approved.filter((e) => e.kind === "correction").sort((a, b) => a.approved_at!.localeCompare(b.approved_at!) || a.id - b.id);
  for (const c of allCorrections) {
    if (!inMonth(c.approved_at)) continue;
    const claim = claimById.get(c.corrects_id!);
    if (!claim) continue;
    const before = [...allCorrections.filter((x) => x.corrects_id === c.corrects_id && (x.approved_at! < c.approved_at! || (x.approved_at === c.approved_at && x.id < c.id)))].pop() ?? claim;
    const day = dublinDay(c.approved_at!);
    corrections.push(
      {
        claim: claim.id,
        correction: c.id,
        line: "Taken out",
        approved_on: day,
        receipt_date: before.receipt_date,
        category: category(before.category_id),
        fund: fund(before.fund_id),
        amount_cents: -before.amount_cents,
        vat_cents: before.vat_cents == null ? null : -before.vat_cents,
        reason: c.correction_reason ?? "",
      },
      {
        claim: claim.id,
        correction: c.id,
        line: "Put in",
        approved_on: day,
        receipt_date: c.receipt_date,
        category: category(c.category_id),
        fund: fund(c.fund_id),
        amount_cents: c.amount_cents,
        vat_cents: c.vat_cents,
        reason: c.correction_reason ?? "",
      },
    );
  }

  const repaymentLines: RepaymentLine[] = [];
  for (const r of [...repayments].sort((a, b) => a.id - b.id)) {
    const covered = links.filter((l) => l.repayment_id === r.id);
    const total = covered.reduce((n, l) => n + l.amount_cents, 0);
    const base = {
      repayment: r.id,
      paid_on: r.paid_on,
      recorded_on: dublinDay(r.created_at),
      person: names.personName(r.person_id),
      method: METHOD_LABEL[r.method],
      reference: r.reference ?? "",
      claims: covered.map((l) => claimNumber(l.claim_id)).join(" "),
    };
    if (inMonth(r.created_at)) repaymentLines.push({ ...base, kind: "Paid", total_cents: total, note: "" });
    if (r.withdrawn_at && inMonth(r.withdrawn_at)) {
      repaymentLines.push({ ...base, kind: "Withdrawn", total_cents: -total, note: `Withdrawn ${dublinDay(r.withdrawn_at)}: ${r.withdrawn_reason ?? ""}` });
    }
  }

  const byFund = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  for (const c of claims) {
    add(byFund, c.fund, c.amount_cents);
    add(byCategory, c.category, c.amount_cents);
  }
  for (const c of corrections) {
    add(byFund, c.fund, c.amount_cents);
    add(byCategory, c.category, c.amount_cents);
  }
  for (const m of [byFund, byCategory]) for (const [k, v] of m) if (v === 0) m.delete(k);
  return {
    month,
    claims,
    corrections,
    repayments: repaymentLines,
    byFund,
    byCategory,
    total_cents: [...byFund.values()].reduce((n, v) => n + v, 0),
    repaid_cents: repaymentLines.reduce((n, r) => n + r.total_cents, 0),
  };
}

/** Euro as a plain number a spreadsheet can add up ("-45.00" stays a number). */
const num = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));

/** The CSV file: the three parts one under the other, each with its own heading row. */
export function monthCsv(x: MonthExport): string {
  const rows: string[][] = [];
  const numeric = new Set<string>();
  const cell = (v: string) => v;
  const n = (cents: number | null) => {
    const v = num(cents);
    numeric.add(v);
    return v;
  };
  rows.push([`ICCI expenses for ${x.month}`]);
  rows.push([]);
  rows.push(["Part 1: Claims approved this month"]);
  rows.push(["Claim", "Date on receipt", "Date approved", "Paid to", "What it was for", "Category", "Fund", "Amount (EUR)", "VAT (EUR)", "How paid", "Who paid", "Approved by", "Second approver", "Receipt"]);
  for (const c of x.claims) {
    rows.push([claimNumber(c.id), c.receipt_date, c.approved_on, c.paid_to, c.description, c.category, c.fund, n(c.amount_cents), n(c.vat_cents), c.payment, c.paid_by, c.approved_by, c.second_by, c.receipt].map(cell));
  }
  rows.push([]);
  rows.push(["Part 2: Corrections approved this month (old line taken out, new line put in)"]);
  rows.push(["Claim", "Correction", "Line", "Date approved", "Date on receipt", "Category", "Fund", "Amount (EUR)", "VAT (EUR)", "Why"]);
  for (const c of x.corrections) {
    rows.push([claimNumber(c.claim), claimNumber(c.correction), c.line, c.approved_on, c.receipt_date, c.category, c.fund, n(c.amount_cents), n(c.vat_cents), c.reason]);
  }
  rows.push([]);
  rows.push(["Part 3: Repayments recorded this month (a withdrawn repayment as a minus)"]);
  rows.push(["Repayment", "Line", "Date paid", "Date recorded", "Paid to", "Total (EUR)", "How", "Reference", "Claims covered", "Note"]);
  for (const r of x.repayments) {
    rows.push([`R-${String(r.repayment).padStart(4, "0")}`, r.kind, r.paid_on, r.recorded_on, r.person, n(r.total_cents), r.method, r.reference, r.claims, r.note]);
  }
  rows.push([]);
  rows.push(["Total approved spending this month (EUR)", n(x.total_cents)]);
  // Amounts are written as plain numbers (a minus sign included); every other cell is made safe for a spreadsheet.
  return "﻿" + rows.map((r) => r.map((v) => (numeric.has(v) && /^-?\d+\.\d{2}$/.test(v) ? v : csvCell(v))).join(",") + "\r\n").join("");
}

/** "icci-expenses-2026-11.csv". */
export function monthFileName(month: string): string {
  return `icci-expenses-${month}.csv`;
}
