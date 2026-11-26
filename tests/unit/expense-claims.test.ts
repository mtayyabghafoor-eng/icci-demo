// Slices P5.2 to P5.4: the plain checks on the expense forms, the claim
// number, who may decide (the screen's view of the database's rules), the
// month helpers, a receipt's file name, checking a file by its first bytes,
// and the made-up seed claims with their plainly fake receipt pictures.
import { describe, expect, it } from "vitest";
import {
  claimNumber,
  friendlyClaimError,
  mayDecide,
  monthName,
  monthRange,
  parseClaimForm,
  parseClaimNumber,
  parseCorrectionForm,
  parseDecisionForm,
  parseRepaymentForm,
  receiptFileName,
  recentMonths,
} from "@/lib/expenses/claims";
import { sniffType } from "@/lib/files";
import { sampleReceiptPng, seedClaims, SEED_SHOPS } from "../../scripts/seed-data.mts";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const form = (v: Record<string, string>) => (name: string) => v[name] ?? "";
const TODAY = "2026-11-26";
const good = { amount: "45.50", receipt_date: "2026-11-20", category: UUID_A, description: "  Bin   bags ", payment: "personal", paid_by: UUID_B };

describe("claim numbers", () => {
  it("are EXP- and four digits, and can be typed back in several ways", () => {
    expect(claimNumber(7)).toBe("EXP-0007");
    expect(claimNumber(12345)).toBe("EXP-12345");
    expect(parseClaimNumber("EXP-0007")).toBe(7);
    expect(parseClaimNumber("exp7")).toBe(7);
    expect(parseClaimNumber("42")).toBe(42);
    expect(parseClaimNumber("T-0042")).toBeNull();
  });
});

describe("the new claim form", () => {
  it("accepts a normal claim, tidying the description", () => {
    const r = parseClaimForm(form(good), true, TODAY);
    expect(r).toEqual({
      ok: true,
      values: {
        amount_cents: 4550,
        vat_cents: null,
        receipt_date: "2026-11-20",
        category_id: UUID_A,
        description: "Bin bags",
        payment: "personal",
        paid_by_person_id: UUID_B,
        paid_to_company_id: null,
        paid_to_text: null,
        ticket_id: null,
        suggested_fund_id: null,
        receipt_lost_reason: null,
      },
    });
  });

  it("needs a receipt or a reason it is lost, never both", () => {
    expect(parseClaimForm(form(good), false, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/receipt lost/i) });
    expect(parseClaimForm(form({ ...good, receipt_lost: "yes" }), false, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/why/i) });
    expect(parseClaimForm(form({ ...good, receipt_lost: "yes", lost_reason: "x" }), true, TODAY)).toMatchObject({ ok: false });
    const lost = parseClaimForm(form({ ...good, receipt_lost: "yes", lost_reason: "Never given one" }), false, TODAY);
    expect(lost.ok && lost.values.receipt_lost_reason).toBe("Never given one");
  });

  it("refuses a bad amount, VAT above the amount, a future date and a missing category or description", () => {
    for (const [field, value] of [
      ["amount", ""],
      ["amount", "abc"],
      ["amount", "0"],
      ["amount", "1000000.01"],
      ["vat", "50"],
      ["vat", "x"],
      ["receipt_date", "2026-11-27"],
      ["receipt_date", "1999-12-31"],
      ["receipt_date", "yesterday"],
      ["category", ""],
      ["description", "  "],
    ]) {
      expect(parseClaimForm(form({ ...good, [field]: value }), true, TODAY).ok, `${field}=${value}`).toBe(false);
    }
  });

  it("asks who paid unless the Centre paid directly", () => {
    expect(parseClaimForm(form({ ...good, paid_by: "" }), true, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/own money/) });
    expect(parseClaimForm(form({ ...good, payment: "centre_card", paid_by: "" }), true, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/card/) });
    const direct = parseClaimForm(form({ ...good, payment: "centre_direct" }), true, TODAY);
    expect(direct.ok && direct.values.paid_by_person_id).toBeNull();
    expect(parseClaimForm(form({ ...good, payment: "cash" }), true, TODAY).ok).toBe(false);
  });

  it("takes a company from the list or a typed name (not both), a ticket and a suggested fund", () => {
    const r = parseClaimForm(form({ ...good, paid_to_company: UUID_A, paid_to_text: "ignored", ticket: "T-0042", suggested_fund: UUID_B, vat: "8.42" }), true, TODAY);
    expect(r.ok && r.values).toMatchObject({ paid_to_company_id: UUID_A, paid_to_text: null, ticket_id: 42, suggested_fund_id: UUID_B, vat_cents: 842 });
    const typed = parseClaimForm(form({ ...good, paid_to_text: " Corner  shop " }), true, TODAY);
    expect(typed.ok && typed.values.paid_to_text).toBe("Corner shop");
    expect(parseClaimForm(form({ ...good, ticket: "abc" }), true, TODAY).ok).toBe(false);
  });
});

describe("decisions, corrections and repayments", () => {
  it("approving needs a fund; rejecting and withdrawing need a reason", () => {
    expect(parseDecisionForm("approved", form({})).ok).toBe(false);
    expect(parseDecisionForm("approved", form({ fund: UUID_A }))).toEqual({ ok: true, values: { fund_id: UUID_A, note: null } });
    expect(parseDecisionForm("second_approved", form({}))).toEqual({ ok: true, values: { fund_id: null, note: null } });
    expect(parseDecisionForm("rejected", form({ fund: UUID_A })).ok).toBe(false);
    expect(parseDecisionForm("rejected", form({ note: "Personal" }))).toEqual({ ok: true, values: { fund_id: null, note: "Personal" } });
    expect(parseDecisionForm("withdrawn", form({})).ok).toBe(false);
  });

  it("a correction needs the right values, a fund and a reason", () => {
    const c = { amount: "54", receipt_date: "2026-11-20", category: UUID_A, fund: UUID_B, reason: "Receipt says €54" };
    expect(parseCorrectionForm(form(c), TODAY)).toEqual({
      ok: true,
      values: { amount_cents: 5400, vat_cents: null, receipt_date: "2026-11-20", category_id: UUID_A, suggested_fund_id: UUID_B, correction_reason: "Receipt says €54" },
    });
    expect(parseCorrectionForm(form({ ...c, reason: "" }), TODAY).ok).toBe(false);
    expect(parseCorrectionForm(form({ ...c, fund: "" }), TODAY).ok).toBe(false);
  });

  it("a repayment needs ticked claims, a date and how it was paid", () => {
    const r = { paid_on: "2026-11-25", method: "bank_transfer", reference: " REF1 " };
    expect(parseRepaymentForm(form(r), ["3", "4", "3", "x"], TODAY)).toEqual({
      ok: true,
      values: { claim_ids: [3, 4], paid_on: "2026-11-25", method: "bank_transfer", reference: "REF1" },
    });
    expect(parseRepaymentForm(form(r), [], TODAY).ok).toBe(false);
    expect(parseRepaymentForm(form({ ...r, method: "paypal" }), ["3"], TODAY).ok).toBe(false);
    expect(parseRepaymentForm(form({ ...r, paid_on: "2026-12-01" }), ["3"], TODAY).ok).toBe(false);
  });
});

describe("who may decide (what the screen offers)", () => {
  const claim = { state: "waiting" as const, created_by: "me", first_by: null };
  it("never your own entry, never money you paid, only when linked, and a third person for the second approval", () => {
    expect(mayDecide("me", true, claim, false)).toMatchObject({ ok: false, why: expect.stringMatching(/you entered/i) });
    expect(mayDecide("you", true, { ...claim, created_by: "them" }, true)).toMatchObject({ ok: false, why: expect.stringMatching(/you paid/i) });
    expect(mayDecide("you", false, { ...claim, created_by: "them" }, false)).toMatchObject({ ok: false, why: expect.stringMatching(/not linked/i) });
    expect(mayDecide("you", true, { state: "second", created_by: "them", first_by: "you" }, false)).toMatchObject({ ok: false, why: expect.stringMatching(/first approval/i) });
    expect(mayDecide("you", true, { ...claim, created_by: "them" }, false)).toEqual({ ok: true });
    // Migration 0053: not a correction of a claim you entered.
    expect(mayDecide("you", true, { ...claim, created_by: "them" }, false, "you")).toMatchObject({ ok: false, why: expect.stringMatching(/claim this corrects/i) });
    expect(mayDecide("you", true, { ...claim, created_by: "them" }, false, "someone else")).toEqual({ ok: true });
    expect(mayDecide("you", true, { state: "approved", created_by: "them", first_by: "x" }, false).ok).toBe(false);
  });

  it("the database's plain refusals reach the screen; technical ones do not", () => {
    expect(friendlyClaimError("You entered this claim, so a different admin must decide on it.")).toMatch(/you entered/i);
    expect(friendlyClaimError('new row violates row-level security policy for table "expense_claims"')).toBe("Your account is not allowed to do this.");
    expect(friendlyClaimError('duplicate key value violates unique constraint "expense_decisions_claim_id_kind_key"')).toMatch(/a moment ago/);
    expect(friendlyClaimError('relation "x" does not exist')).toMatch(/try again/i);
  });
});

describe("months and file names", () => {
  it("a month's range, name and the last twelve months", () => {
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
    expect(monthRange("2026-13")).toBeNull();
    expect(monthName("2026-11")).toBe("November 2026");
    const months = recentMonths("2026-02-10");
    expect(months.slice(0, 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
    expect(months).toHaveLength(12);
  });

  it("a receipt is saved as EXP-0041-receipt-1.jpg", () => {
    expect(receiptFileName(41, 1, "claims/2026-11/abc-receipt-1.jpg")).toBe("EXP-0041-receipt-1.jpg");
    expect(receiptFileName(41, 2, "claims/x.pdf")).toBe("EXP-0041-receipt-2.pdf");
  });
});

describe("files are checked by their first bytes", () => {
  it("knows a PDF, JPEG, PNG and WebP, and nothing else", () => {
    expect(sniffType(new TextEncoder().encode("%PDF-1.4 rest"))).toBe("application/pdf");
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffType(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
    expect(sniffType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffType(new TextEncoder().encode("MZ executable"))).toBeNull();
  });
});

describe("made-up seed claims", () => {
  const claims = seedClaims();
  it("about 60 claims in every state, with made-up shops only", () => {
    expect(claims).toHaveLength(60);
    for (const state of ["waiting", "second", "approved", "rejected", "withdrawn"]) expect(claims.some((c) => c.outcome === state), state).toBe(true);
    for (const c of claims) {
      expect(c.description).toMatch(/^Test /);
      expect(c.shop).toMatch(/^Test /);
      expect(SEED_SHOPS).toContain(c.shop);
    }
    expect(claims.some((c) => c.lost)).toBe(true);
    expect(claims.some((c) => c.repaid)).toBe(true);
    expect(claims.some((c) => c.correctTo)).toBe(true);
  });

  it("a claim needing a second approval is over €500, or over €50 without a receipt", () => {
    for (const c of claims.filter((x) => x.outcome === "second")) expect(c.amountCents > 50000 || (c.lost !== null && c.amountCents > 5000)).toBe(true);
  });

  it("each receipt picture is a real PNG", async () => {
    const png = await sampleReceiptPng(["Test Hardware Shop", "Total EUR 12.50"]);
    expect(sniffType(png)).toBe("image/png");
    expect(png.length).toBeGreaterThan(200);
  });
});
