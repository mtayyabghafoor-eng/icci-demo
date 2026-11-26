"use server";
// What happens when the Expense settings forms are sent (slice P5.1). Runs
// on the web server as the signed-in account: the database decides what is
// allowed (Super Admin and Finance keep the lists; only a Super Admin
// changes the amounts; nothing is deleted).
import { redirect } from "next/navigation";
import { friendlyExpenseError, isSettingKey, parseListName, parseNewFund, parseSettingAmount } from "@/lib/expenses/rules";
import { formGetter, UUID } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type ExpenseFormState = { error: string | null };

const PAGE = "/expenses/settings";
const TABLE = { category: "expense_categories", fund: "expense_funds" } as const;
type ListKind = keyof typeof TABLE;

export async function addListEntry(kind: ListKind, _state: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
  const parsed = kind === "fund" ? parseNewFund(formGetter(form)) : parseListName(formGetter(form), "category");
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE[kind]).insert(parsed.values).select("id");
  if (error) return { error: friendlyExpenseError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${PAGE}?done=${kind}-added#${kind}-${data[0].id}`);
}

export async function renameListEntry(kind: ListKind, id: string, _state: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
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
  if (!UUID.test(id)) redirect(PAGE);
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE[kind]).update({ active }).eq("id", id).select("id");
  if (error || !data?.length) redirect(`${PAGE}?done=not-allowed`);
  redirect(`${PAGE}?done=${active ? "switched-on" : "switched-off"}#${kind}-${id}`);
}

export async function saveSetting(key: string, _state: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
  if (!isSettingKey(key)) return { error: "That setting could not be found." };
  const parsed = parseSettingAmount(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").update(parsed.values).eq("key", key).select("key");
  if (error) return { error: friendlyExpenseError(error.message) };
  if (!data?.length) return { error: "Only a Super Admin can change this amount." };
  redirect(`${PAGE}?done=amount-saved`);
}
