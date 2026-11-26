// Slice P5.5: the monthly file for the bookkeeper (docs/PHASE-5.md section
// 7). Claims approved in the month; corrections as the old line out and the
// new line in (so a fund-only change moves the money); repayments recorded
// in the month and withdrawn ones as a minus; everything by the month it
// happened; the totals by fund and by category always agree; the file is
// safe to open in a spreadsheet.
import { describe, expect, it } from "vitest";
import type { EntryRow } from "@/lib/expenses/claims";
import { buildMonthExport, monthCsv, monthFileName, type ExportNames, type RepaymentLink, type RepaymentRow } from "@/lib/expenses/export";

const names: ExportNames = {
  personName: (id) => (id ? `Person ${id}` : ""),
  accountName: (id) => (id ? `Admin ${id}` : ""),
  categoryName: new Map([
    ["cat-a", "Cleaning"],
    ["cat-b", "Repairs"],
  ]),
  fundName: new Map([
    ["unr", "Unrestricted"],
    ["zak", "Zakat"],
  ]),
  paidTo: (e) => e.paid_to_text ?? "",
};

let nextId = 1;
function entry(o: Partial<EntryRow> & { approved_at: string | null }): EntryRow {
  return {
    id: nextId++,
    kind: "claim",
    corrects_id: null,
    correction_reason: null,
    copied_from_id: null,
    amount_cents: 1000,
    vat_cents: null,
    receipt_date: "2026-10-05",
    category_id: "cat-a",
    description: "Test thing",
    paid_to_company_id: null,
    paid_to_text: "Test Shop",
    ticket_id: null,
    payment: "personal",
    paid_by_person_id: "p1",
    suggested_fund_id: null,
    receipt_lost_reason: null,
    created_by: "a1",
    created_at: "2026-10-05T10:00:00Z",
    state: "approved",
    first_by: "a2",
    first_at: o.approved_at,
    first_fund_id: "unr",
    needs_second: false,
    second_by: null,
    second_at: null,
    second_fund_id: null,
    fund_id: "unr",
    closed_by: null,
    closed_at: null,
    closed_note: null,
    ...o,
  };
}

describe("one month's file", () => {
  const claim = entry({ approved_at: "2026-10-10T12:00:00Z", amount_cents: 4500 });
  const claimNov = entry({ approved_at: "2026-11-02T12:00:00Z", amount_cents: 700, category_id: "cat-b" });
  // Corrected in November: amount 45 → 54, then moved to Zakat.
  const fix1 = entry({ kind: "correction", corrects_id: claim.id, correction_reason: "Receipt said 54", approved_at: "2026-11-03T09:00:00Z", amount_cents: 5400 });
  const fix2 = entry({ kind: "correction", corrects_id: claim.id, correction_reason: "Zakat", approved_at: "2026-11-04T09:00:00Z", amount_cents: 5400, fund_id: "zak" });
  const waiting = entry({ approved_at: null, state: "waiting" });
  const entries = [claim, claimNov, fix1, fix2, waiting];
  const repayments: RepaymentRow[] = [
    { id: 1, person_id: "p1", paid_on: "2026-10-30", method: "bank_transfer", reference: "REF", withdrawn_reason: "Wrong person", withdrawn_at: "2026-11-05T10:00:00Z", created_at: "2026-10-31T10:00:00Z" },
    { id: 2, person_id: "p1", paid_on: "2026-11-06", method: "cash", reference: null, withdrawn_reason: null, withdrawn_at: null, created_at: "2026-11-06T10:00:00Z" },
  ];
  const links: RepaymentLink[] = [
    { repayment_id: 1, claim_id: claim.id, amount_cents: 4500 },
    { repayment_id: 2, claim_id: claim.id, amount_cents: 5400 },
  ];
  const oct = buildMonthExport("2026-10", entries, new Map([[claim.id, 2]]), repayments, links, names);
  const nov = buildMonthExport("2026-11", entries, new Map(), repayments, links, names);

  it("claims go in the month they were approved, as approved", () => {
    expect(oct.claims.map((c) => c.id)).toEqual([claim.id]);
    expect(oct.claims[0]).toMatchObject({ amount_cents: 4500, fund: "Unrestricted", receipt: "2 files", approved_by: "Admin a2", paid_by: "Person p1" });
    expect(nov.claims.map((c) => c.id)).toEqual([claimNov.id]);
  });

  it("each correction is the old line out and the new line in, in the month it was approved", () => {
    expect(oct.corrections).toHaveLength(0);
    expect(nov.corrections.map((c) => [c.line, c.amount_cents, c.fund])).toEqual([
      ["Taken out", -4500, "Unrestricted"],
      ["Put in", 5400, "Unrestricted"],
      ["Taken out", -5400, "Unrestricted"],
      ["Put in", 5400, "Zakat"],
    ]);
  });

  it("the totals by fund and by category agree, and a fund-only change moves the money", () => {
    expect(oct.total_cents).toBe(4500);
    expect(nov.total_cents).toBe(700 + 900);
    expect(nov.byFund.get("Zakat")).toBe(5400);
    expect(nov.byFund.get("Unrestricted")).toBe(700 - 4500);
    for (const m of [oct, nov]) {
      expect([...m.byFund.values()].reduce((n, v) => n + v, 0)).toBe(m.total_cents);
      expect([...m.byCategory.values()].reduce((n, v) => n + v, 0)).toBe(m.total_cents);
    }
    // Over both months, what is approved equals the claims' current values.
    expect(oct.total_cents + nov.total_cents).toBe(5400 + 700);
  });

  it("repayments go in the month recorded; a withdrawal is a minus in the month it was withdrawn", () => {
    expect(oct.repayments.map((r) => [r.kind, r.total_cents])).toEqual([["Paid", 4500]]);
    expect(nov.repayments.map((r) => [r.kind, r.total_cents])).toEqual([
      ["Withdrawn", -4500],
      ["Paid", 5400],
    ]);
    expect(nov.repaid_cents).toBe(900);
  });

  it("the CSV has the three parts, amounts as plain numbers (minus included), and text made safe", () => {
    const evil = entry({ approved_at: "2026-10-11T12:00:00Z", description: "=HYPERLINK(1)", paid_to_text: "Shop, \"quoted\"" });
    const csv = monthCsv(buildMonthExport("2026-10", [evil], new Map(), [], [], names));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Part 1: Claims approved this month");
    expect(csv).toContain("Part 2: Corrections");
    expect(csv).toContain("Part 3: Repayments");
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain('"Shop, ""quoted"""');
    const novCsv = monthCsv(nov);
    expect(novCsv).toContain(",-45.00,");
    expect(novCsv).not.toContain("'-45.00");
    expect(monthFileName("2026-11")).toBe("icci-expenses-2026-11.csv");
  });
});
