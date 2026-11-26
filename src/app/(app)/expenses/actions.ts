"use server";
// What happens when an expense form is sent (slices P5.2 to P5.4). Runs on
// the web server as the signed-in admin; the database's rules decide what is
// allowed (migration 0050). Receipt files are saved first, each a new file,
// then the claim and its files are entered in one step.
import { redirect } from "next/navigation";
import {
  claimNumber,
  friendlyClaimError,
  isDecisionKind,
  parseClaimForm,
  parseCorrectionForm,
  parseDecisionForm,
  parseRepaymentForm,
  parseRepaymentWithdrawal,
  RECEIPT_BUCKET,
  RECEIPT_MAX_FILES,
  RECEIPT_MAX_MB,
  todayInDublin,
} from "@/lib/expenses/claims";
import { formatDate, formatEuro } from "@/lib/items/rules";
import { filesFrom } from "@/lib/files";
import { formGetAll, formGetter } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type ClaimFormState = { error: string | null; warning?: string | null };

/**
 * A new claim. `copiedFrom`: "Enter again" from a withdrawn or rejected
 * claim; its receipt files are kept unless new ones are chosen.
 */
export async function enterClaim(copiedFrom: number | null, _state: ClaimFormState, form: FormData): Promise<ClaimFormState> {
  const get = formGetter(form);
  const files = await filesFrom(form, "receipt", { maxFiles: RECEIPT_MAX_FILES, maxMb: RECEIPT_MAX_MB, what: "receipt" });
  if (typeof files === "string") return { error: files };
  const supabase = await createClient();

  // "Enter again": the old claim's files, unless new ones were chosen.
  let keptPaths: string[] = [];
  if (copiedFrom && !files.length && get("keep_files") === "yes") {
    const { data } = await supabase.from("expense_files").select("file_path").eq("claim_id", copiedFrom).order("position");
    keptPaths = (data ?? []).map((f) => f.file_path as string);
  }
  const parsed = parseClaimForm(get, files.length + keptPaths.length > 0);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.values;

  // A warning, never a block: the same amount on the same receipt date.
  if (get("confirm_duplicate") !== "yes") {
    const { data: same } = await supabase
      .from("expense_claim_list")
      .select("id, state")
      .eq("amount_cents", v.amount_cents)
      .eq("receipt_date", v.receipt_date)
      .not("state", "in", "(withdrawn,rejected)")
      .order("id")
      .limit(1);
    const twin = same?.[0];
    if (twin && twin.id !== copiedFrom) {
      return {
        error: null,
        warning: `${claimNumber(twin.id)} is already recorded for ${formatEuro(v.amount_cents)} on ${formatDate(v.receipt_date)}. Is this a different receipt? If so, save anyway.`,
      };
    }
  }

  const month = todayInDublin().slice(0, 7);
  const paths = [...keptPaths];
  for (const [i, f] of files.entries()) {
    const path = `claims/${month}/${crypto.randomUUID()}-receipt-${i + 1}.${f.ext}`;
    const up = await supabase.storage.from(RECEIPT_BUCKET).upload(path, f.file, { contentType: f.type });
    if (up.error) return { error: "The receipt could not be saved. Please try again." };
    paths.push(path);
  }

  const { data: id, error } = await supabase.rpc("enter_expense_claim", {
    p_amount_cents: v.amount_cents,
    p_receipt_date: v.receipt_date,
    p_category_id: v.category_id,
    p_description: v.description,
    p_payment: v.payment,
    p_paid_by_person_id: v.paid_by_person_id,
    p_vat_cents: v.vat_cents,
    p_paid_to_company_id: v.paid_to_company_id,
    p_paid_to_text: v.paid_to_text,
    p_ticket_id: v.ticket_id,
    p_suggested_fund_id: v.suggested_fund_id,
    p_receipt_lost_reason: v.receipt_lost_reason,
    p_files: paths,
    p_copied_from_id: copiedFrom,
  });
  if (error || typeof id !== "number") return { error: friendlyClaimError(error?.message) };
  if (get("then") === "another") redirect(`/expenses/new?done=entered&last=${id}`);
  redirect(`/expenses/${id}?done=entered`);
}

/** Approve, give the second approval, reject, or withdraw (P5.2, P5.3). */
export async function decideClaim(claimId: number, kind: string, _state: ClaimFormState, form: FormData): Promise<ClaimFormState> {
  if (!isDecisionKind(kind)) return { error: "Unknown step." };
  const parsed = parseDecisionForm(kind, formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("expense_decisions").insert({ claim_id: claimId, kind, ...parsed.values });
  if (error) return { error: friendlyClaimError(error.message) };
  redirect(`/expenses/${claimId}?done=${kind}`);
}

/** "Correct this claim" (P5.4): a new entry pointing at the approved claim. */
export async function correctClaim(claimId: number, _state: ClaimFormState, form: FormData): Promise<ClaimFormState> {
  const parsed = parseCorrectionForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.values;
  const supabase = await createClient();
  const { data: claim } = await supabase.from("expense_claims").select("payment, paid_by_person_id, description").eq("id", claimId).maybeSingle();
  if (!claim) return { error: "This claim could not be found." };
  const { data: id, error } = await supabase.rpc("enter_expense_claim", {
    p_amount_cents: v.amount_cents,
    p_receipt_date: v.receipt_date,
    p_category_id: v.category_id,
    p_description: claim.description,
    p_payment: claim.payment,
    p_paid_by_person_id: claim.paid_by_person_id,
    p_vat_cents: v.vat_cents,
    p_suggested_fund_id: v.suggested_fund_id,
    p_corrects_id: claimId,
    p_correction_reason: v.correction_reason,
  });
  if (error || typeof id !== "number") return { error: friendlyClaimError(error?.message) };
  redirect(`/expenses/${id}?done=correction-entered`);
}

/** One repayment for one or more claims of one person (P5.4). */
export async function recordRepayment(_state: ClaimFormState, form: FormData): Promise<ClaimFormState> {
  const parsed = parseRepaymentForm(formGetter(form), formGetAll(form)("claim"));
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.values;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_expense_repayment", {
    p_claim_ids: v.claim_ids,
    p_paid_on: v.paid_on,
    p_method: v.method,
    p_reference: v.reference,
  });
  if (error) return { error: friendlyClaimError(error.message) };
  redirect(`/expenses?tab=repay&done=repaid`);
}

/** A wrong repayment is withdrawn once, with a reason; its claims are owed again. */
export async function withdrawRepayment(repaymentId: number, claimId: number, _state: ClaimFormState, form: FormData): Promise<ClaimFormState> {
  const reason = parseRepaymentWithdrawal(formGetter(form));
  if (!reason.ok) return { error: reason.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("expense_repayments").update({ withdrawn_reason: reason.values }).eq("id", repaymentId).select("id");
  if (error) return { error: friendlyClaimError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/expenses/${claimId}?done=repayment-withdrawn`);
}
