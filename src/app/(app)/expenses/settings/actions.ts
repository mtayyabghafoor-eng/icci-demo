"use server";
// What happens when the Expense settings forms are sent (slice P5.1). Runs
// on the web server as the signed-in account: the database decides what is
// allowed (Super Admin and Finance keep the lists; a Super Admin asks for a
// new amount and a different Super Admin confirms it; nothing is deleted).
import { notFound, redirect } from "next/navigation";
import {
  friendlyExpenseError,
  isSettingDecision,
  isSettingKey,
  parseListName,
  parseNewFund,
  parseSettingAmount,
  type SettingDecision,
} from "@/lib/expenses/rules";
import { formGetter, UUID } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { NOT_FOUND, anyBad, isBool, isId, isOneOf, isUuid } from "@/lib/action-input";

export type ExpenseFormState = { error: string | null };

const PAGE = "/expenses/settings";
const TABLE = { category: "expense_categories", fund: "expense_funds" } as const;
type ListKind = keyof typeof TABLE;

export async function addListEntry(kind: ListKind, _state: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isOneOf(kind, ["category", "fund"]))) return { error: NOT_FOUND };
  const parsed = kind === "fund" ? parseNewFund(formGetter(form)) : parseListName(formGetter(form), "category");
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE[kind]).insert(parsed.values).select("id");
  if (error) return { error: friendlyExpenseError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${PAGE}?done=${kind}-added#${kind}-${data[0].id}`);
}

export async function renameListEntry(kind: ListKind, id: string, _state: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isOneOf(kind, ["category", "fund"]), isUuid(id))) return { error: NOT_FOUND };
  if (!UUID.test(id)) return { error: "That could not be found." };
  const parsed = parseListName(formGetter(form), kind);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE[kind]).update(parsed.values).eq("id", id).select("id");
  if (error) return { error: friendlyExpenseError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${PAGE}?done=renamed#${kind}-${id}`);
}

export async function setListEntryActive(kind: ListKind, id: string, active: boolean): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isOneOf(kind, ["category", "fund"]), isUuid(id), isBool(active))) notFound();
  if (!UUID.test(id)) redirect(PAGE);
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE[kind]).update({ active }).eq("id", id).select("id");
  if (error || !data?.length) redirect(`${PAGE}?done=not-allowed`);
  redirect(`${PAGE}?done=${active ? "switched-on" : "switched-off"}#${kind}-${id}`);
}

/**
 * Ask for a new amount (security review, 26 Nov 2026, finding 1): it takes
 * effect only when a different Super Admin confirms it (migration 0052).
 */
export async function askSettingChange(key: string, _state: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
  if (!isSettingKey(key)) return { error: "That setting could not be found." };
  const parsed = parseSettingAmount(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_setting_changes").insert({ key, ...parsed.values }).select("id");
  if (error) return { error: friendlyExpenseError(error.message) };
  if (!data?.length) return { error: "Only a Super Admin can ask for a new amount." };
  redirect(`${PAGE}?done=change-asked`);
}

/** Confirm or turn down another Super Admin's request, or cancel your own. */
export async function decideSettingChange(id: number, status: SettingDecision, _state: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isId(id))) return { error: NOT_FOUND };
  if (!Number.isInteger(id) || !isSettingDecision(status)) return { error: "That could not be found." };
  const note = formGetter(form)("note").trim().slice(0, 500);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_setting_changes")
    .update({ status, note: note || null })
    .eq("id", id)
    .select("id");
  if (error) return { error: friendlyExpenseError(error.message) };
  if (!data?.length) return { error: "Only a Super Admin can do this." };
  redirect(`${PAGE}?done=change-${status.replace("_", "-")}`);
}
