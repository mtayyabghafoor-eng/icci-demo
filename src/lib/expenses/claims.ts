// Expense claims (PLAN.md 5.5; docs/PHASE-5.md sections 6 and 7, slices
// P5.2 to P5.5): the words the screens use, and the plain checks on each
// form before it is sent. The database enforces every rule again
// (migration 0050); these only give a clearer message sooner.
import type { Get } from "@/lib/forms";
import { UUID } from "@/lib/forms";
import type { Tone } from "@/lib/items/rules";
import { parseEuro } from "@/lib/items/rules";
import { MAX_CENTS } from "./rules";

type Parsed<T> = { ok: true; values: T } | { ok: false; error: string };

export const RECEIPT_BUCKET = "expense-receipts";
export const RECEIPT_MAX_FILES = 3;
export const RECEIPT_MAX_MB = 10;

export type ClaimState = "waiting" | "second" | "approved" | "rejected" | "withdrawn";
export type Payment = "centre_direct" | "centre_card" | "personal";
export type RepayMethod = "bank_transfer" | "cash" | "cheque";

export const STATE_LABEL: Record<ClaimState, { word: string; tone: Tone }> = {
  waiting: { word: "Waiting", tone: "amber" },
  second: { word: "Needs a second approval", tone: "amber" },
  approved: { word: "Approved", tone: "green" },
  rejected: { word: "Rejected", tone: "red" },
  withdrawn: { word: "Withdrawn", tone: "grey" },
};

export const PAYMENT_LABEL: Record<Payment, string> = {
  centre_direct: "The Centre paid directly (direct debit or bank transfer)",
  centre_card: "The Centre's card",
  personal: "A person's own money",
};

export const PAYMENT_SHORT: Record<Payment, string> = {
  centre_direct: "Centre paid directly",
  centre_card: "Centre card",
  personal: "Own money",
};

export const METHOD_LABEL: Record<RepayMethod, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
};

/** EXP-0007: the claim's number, from the database's own counter. */
export function claimNumber(id: number): string {
  return `EXP-${String(id).padStart(4, "0")}`;
}

/** EXP-0007 or 7 → 7; anything else → null. */
export function parseClaimNumber(raw: string): number | null {
  const m = raw.trim().match(/^(?:exp-?)?0*(\d{1,9})$/i);
  return m ? Number(m[1]) : null;
}

/** The claim row as the list view gives it (migration 0050). */
export type ClaimRow = {
  id: number;
  kind: "claim";
  copied_from_id: number | null;
  amount_cents: number;
  vat_cents: number | null;
  receipt_date: string;
  category_id: string;
  description: string;
  paid_to_company_id: string | null;
  paid_to_text: string | null;
  ticket_id: number | null;
  payment: Payment;
  paid_by_person_id: string | null;
  suggested_fund_id: string | null;
  receipt_lost_reason: string | null;
  created_by: string | null;
  created_at: string;
  state: ClaimState;
  first_by: string | null;
  first_at: string | null;
  first_fund_id: string | null;
  needs_second: boolean;
  second_by: string | null;
  second_at: string | null;
  second_fund_id: string | null;
  fund_id: string | null;
  approved_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  closed_note: string | null;
  correction_id: number | null;
  current_amount_cents: number;
  current_vat_cents: number | null;
  current_receipt_date: string;
  current_category_id: string;
  current_fund_id: string | null;
  repaid_cents: number;
  owed_cents: number;
  file_count: number;
};

/** A claim or a correction, as expense_entries gives it. */
export type EntryRow = Omit<
  ClaimRow,
  "kind" | "correction_id" | "current_amount_cents" | "current_vat_cents" | "current_receipt_date" | "current_category_id" | "current_fund_id" | "repaid_cents" | "owed_cents" | "file_count"
> & { kind: "claim" | "correction"; corrects_id: number | null; correction_reason: string | null };

export const CLAIM_COLUMNS = "*";

/** Today in Ireland, as 2026-11-26. */
export function todayInDublin(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parseDate(raw: string, what: string, today: string): Parsed<string> {
  const v = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) return { ok: false, error: `Type the ${what}.` };
  if (v > today) return { ok: false, error: `The ${what} cannot be in the future.` };
  if (v < "2000-01-01") return { ok: false, error: `Check the ${what}: it is too long ago.` };
  return { ok: true, values: v };
}

function parseAmount(raw: string): Parsed<number> {
  const cents = parseEuro(raw);
  if (cents === null) return { ok: false, error: "Type the amount on the receipt." };
  if (cents === undefined) return { ok: false, error: "Type the amount in euro, for example 45 or 12.50." };
  if (cents <= 0) return { ok: false, error: "The amount must be more than €0." };
  if (cents > MAX_CENTS) return { ok: false, error: "A claim can be at most €1,000,000." };
  return { ok: true, values: cents };
}

function parseVat(raw: string, amount: number): Parsed<number | null> {
  const vat = parseEuro(raw);
  if (vat === null) return { ok: true, values: null };
  if (vat === undefined) return { ok: false, error: "Type the VAT in euro, for example 8.42, or leave it empty." };
  if (vat > amount) return { ok: false, error: "The VAT cannot be more than the amount." };
  return { ok: true, values: vat };
}

export type ClaimValues = {
  amount_cents: number;
  vat_cents: number | null;
  receipt_date: string;
  category_id: string;
  description: string;
  payment: Payment;
  paid_by_person_id: string | null;
  paid_to_company_id: string | null;
  paid_to_text: string | null;
  ticket_id: number | null;
  suggested_fund_id: string | null;
  receipt_lost_reason: string | null;
};

/** The new claim form. `hasFiles`: whether a receipt file was chosen. */
export function parseClaimForm(get: Get, hasFiles: boolean, today: string = todayInDublin()): Parsed<ClaimValues> {
  const lost = get("receipt_lost") === "yes";
  const lostReason = get("lost_reason").trim();
  if (lost && hasFiles) return { ok: false, error: "You ticked “Receipt lost” but also added a receipt. Untick it, or remove the files." };
  if (lost && !lostReason) return { ok: false, error: "Say why there is no receipt, for example “the shop did not give one”." };
  if (lostReason.length > 500) return { ok: false, error: "Keep the explanation to 500 characters or fewer." };
  if (!lost && !hasFiles) return { ok: false, error: "Add a photo or PDF of the receipt, or tick “Receipt lost” and say why." };

  const amount = parseAmount(get("amount"));
  if (!amount.ok) return amount;
  const vat = parseVat(get("vat"), amount.values);
  if (!vat.ok) return vat;
  const date = parseDate(get("receipt_date"), "date on the receipt", today);
  if (!date.ok) return date;
  const category = get("category");
  if (!UUID.test(category)) return { ok: false, error: "Choose what the money was spent on." };
  const description = get("description").trim().replace(/\s+/g, " ");
  if (!description) return { ok: false, error: "Say what it was for, for example “bin bags for Friday prayers”." };
  if (description.length > 500) return { ok: false, error: "Keep “what it was for” to 500 characters or fewer." };

  const payment = get("payment");
  if (!(payment in PAYMENT_LABEL)) return { ok: false, error: "Say how it was paid." };
  const paidBy = get("paid_by");
  if (payment !== "centre_direct" && !UUID.test(paidBy)) {
    return { ok: false, error: payment === "personal" ? "Choose who paid with their own money." : "Choose who used the Centre's card." };
  }

  const company = get("paid_to_company");
  const paidToText = get("paid_to_text").trim().replace(/\s+/g, " ");
  if (company && !UUID.test(company)) return { ok: false, error: "Choose a company from the list, or type the name." };
  if (paidToText.length > 200) return { ok: false, error: "Keep “paid to” to 200 characters or fewer." };

  const ticketRaw = get("ticket").trim().replace(/^t-?/i, "");
  if (ticketRaw && !/^\d{1,9}$/.test(ticketRaw)) return { ok: false, error: "Choose the ticket from the list, or leave it empty." };
  const fund = get("suggested_fund");
  if (fund && !UUID.test(fund)) return { ok: false, error: "Choose a fund from the list, or leave it empty." };

  return {
    ok: true,
    values: {
      amount_cents: amount.values,
      vat_cents: vat.values,
      receipt_date: date.values,
      category_id: category,
      description,
      payment: payment as Payment,
      paid_by_person_id: payment === "centre_direct" ? null : paidBy,
      paid_to_company_id: company || null,
      paid_to_text: company ? null : paidToText || null,
      ticket_id: ticketRaw ? Number(ticketRaw) : null,
      suggested_fund_id: fund || null,
      receipt_lost_reason: lost ? lostReason : null,
    },
  };
}

export type CorrectionValues = {
  amount_cents: number;
  vat_cents: number | null;
  receipt_date: string;
  category_id: string;
  suggested_fund_id: string;
  correction_reason: string;
};

/** "Correct this claim": the right values and why. */
export function parseCorrectionForm(get: Get, today: string = todayInDublin()): Parsed<CorrectionValues> {
  const amount = parseAmount(get("amount"));
  if (!amount.ok) return amount;
  const vat = parseVat(get("vat"), amount.values);
  if (!vat.ok) return vat;
  const date = parseDate(get("receipt_date"), "date on the receipt", today);
  if (!date.ok) return date;
  const category = get("category");
  if (!UUID.test(category)) return { ok: false, error: "Choose what the money was spent on." };
  const fund = get("fund");
  if (!UUID.test(fund)) return { ok: false, error: "Choose the fund." };
  const reason = get("reason").trim();
  if (!reason) return { ok: false, error: "Say why the claim is being corrected, for example “the receipt says €54, not €45”." };
  if (reason.length > 500) return { ok: false, error: "Keep the reason to 500 characters or fewer." };
  return {
    ok: true,
    values: { amount_cents: amount.values, vat_cents: vat.values, receipt_date: date.values, category_id: category, suggested_fund_id: fund, correction_reason: reason },
  };
}

export type DecisionKind = "approved" | "second_approved" | "rejected" | "withdrawn";
export const DECISION_KINDS: DecisionKind[] = ["approved", "second_approved", "rejected", "withdrawn"];

export function isDecisionKind(k: string): k is DecisionKind {
  return (DECISION_KINDS as string[]).includes(k);
}

/** Approve (with a fund), second approval (fund may change), reject or withdraw (with a reason). */
export function parseDecisionForm(kind: DecisionKind, get: Get): Parsed<{ fund_id: string | null; note: string | null }> {
  const note = get("note").trim();
  if (note.length > 1000) return { ok: false, error: "Keep the note to 1,000 characters or fewer." };
  if (kind === "rejected" && !note) return { ok: false, error: "Say why the claim is rejected. The person who entered it will see this." };
  if (kind === "withdrawn" && !note) return { ok: false, error: "Say why you are withdrawing it, for example “typed the wrong amount”." };
  const fund = get("fund");
  if (kind === "approved" && !UUID.test(fund)) return { ok: false, error: "Choose the fund this money comes from." };
  if (fund && !UUID.test(fund)) return { ok: false, error: "Choose a fund from the list." };
  return { ok: true, values: { fund_id: kind === "approved" || kind === "second_approved" ? fund || null : null, note: note || null } };
}

/** Recording one repayment for several claims of one person. */
export function parseRepaymentForm(
  get: Get,
  claims: string[],
  today: string = todayInDublin(),
): Parsed<{ claim_ids: number[]; paid_on: string; method: RepayMethod; reference: string | null }> {
  const ids = claims.filter((c) => /^\d{1,12}$/.test(c)).map(Number);
  if (!ids.length) return { ok: false, error: "Tick at least one claim to pay back." };
  const date = parseDate(get("paid_on"), "date it was paid", today);
  if (!date.ok) return date;
  const method = get("method");
  if (!(method in METHOD_LABEL)) return { ok: false, error: "Say how it was paid back." };
  const reference = get("reference").trim();
  if (reference.length > 100) return { ok: false, error: "Keep the reference to 100 characters or fewer." };
  return { ok: true, values: { claim_ids: [...new Set(ids)], paid_on: date.values, method: method as RepayMethod, reference: reference || null } };
}

export function parseRepaymentWithdrawal(get: Get): Parsed<string> {
  const reason = get("reason").trim();
  if (!reason) return { ok: false, error: "Say why the repayment is being withdrawn, for example “paid to the wrong person”." };
  if (reason.length > 500) return { ok: false, error: "Keep the reason to 500 characters or fewer." };
  return { ok: true, values: reason };
}

/** A database refusal in words an admin can act on. */
export function friendlyClaimError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  if (/duplicate key.*expense_decisions/i.test(message)) return "Someone else decided on this claim a moment ago. The page now shows where it stands.";
  if (/duplicate key.*copied_from/i.test(message)) return "This claim has already been entered again. Open the new claim instead.";
  if (/expense_claims_payer/i.test(message)) return "Say who paid, unless the Centre paid directly.";
  if (/check constraint/i.test(message)) return "Something on the form is not right. Please check it and try again.";
  // The database's own refusals are already written in plain words.
  if (/^[A-Z][^\n]{10,300}$/.test(message) && !/violates|syntax|relation|column|function/i.test(message)) return message;
  return "That could not be saved. Please try again.";
}

/** May this account decide now (the screen's view; the database decides for real)? */
export function mayDecide(
  me: string,
  linked: boolean,
  claim: { state: ClaimState; created_by: string | null; first_by: string | null },
  payerIsMe: boolean,
  /** For a correction: who entered the claim it corrects (migration 0053). */
  correctsEnteredBy: string | null = null,
): { ok: true } | { ok: false; why: string } {
  if (claim.state !== "waiting" && claim.state !== "second") return { ok: false, why: "This claim has been decided." };
  if (me === claim.created_by) return { ok: false, why: "You entered this claim, so a different admin must decide on it." };
  if (correctsEnteredBy && me === correctsEnteredBy)
    return { ok: false, why: "You entered the claim this corrects, so a different admin must decide on the correction." };
  if (payerIsMe) return { ok: false, why: "You paid this money yourself, so a different admin must decide on it." };
  if (!linked) return { ok: false, why: "Your account is not linked to your record in People yet, so you cannot approve or reject claims." };
  if (claim.state === "second" && me === claim.first_by) return { ok: false, why: "You gave the first approval, so a different admin must give the second." };
  return { ok: true };
}

/** "2026-11" → the first day of that month and of the next, for date filters. */
export function monthRange(month: string): { from: string; to: string } | null {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || y < 2000 || y > 2999) return null;
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return { from: `${m[1]}-${m[2]}-01`, to: `${next}-01` };
}

/** "November 2026". */
export function monthName(month: string): string {
  const r = monthRange(month);
  if (!r) return month;
  return new Date(`${r.from}T12:00:00Z`).toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The month (in Ireland) a moment falls in: "2026-11". */
export function monthOf(iso: string): string {
  return todayInDublin(new Date(iso)).slice(0, 7);
}

/** This month and the eleven before it, newest first: "2026-11", "2026-10"… */
export function recentMonths(today: string = todayInDublin(), count = 12): string[] {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** The file name a receipt is downloaded with: EXP-0041-receipt-1.jpg. */
export function receiptFileName(claimId: number, position: number, path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
  return `${claimNumber(claimId)}-receipt-${position}.${/^(pdf|jpg|png|webp)$/.test(ext) ? ext : "jpg"}`;
}
