"use server";
// What happens when a register form is sent (Phase 6). Runs on the web
// server as the signed-in admin: the database decides what is allowed
// (Super Admin only, numbers, corrections of the newest version only,
// cancelling once with a reason, nothing ever changed or deleted).
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formGetAll, formGetter } from "@/lib/forms";
import { NOT_FOUND, anyBad, isDate, isId, orNull } from "@/lib/action-input";
import { friendlyRegisterError, isRegisterKind, MAY_SEE_REGISTERS, parseEntryForm, parseReason, REGISTER, type RegisterKind } from "@/lib/registers/rules";
import { todayInDublin } from "@/lib/vetting/rules";
import { onCallOn } from "./data";

export type EntryFormState = { error: string | null };

/** Records a new entry, or (with `correctsId`) a corrected version of one. */
export async function saveEntry(kind: RegisterKind, correctsId: number | null, _state: EntryFormState, form: FormData): Promise<EntryFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isRegisterKind(kind), orNull(isId)(correctsId))) return { error: NOT_FOUND };
  const parsed = parseEntryForm(kind, formGetter(form), formGetAll(form), todayInDublin());
  if (!parsed.ok) return { error: parsed.error };
  const values: Record<string, unknown> = { ...parsed.values };
  if (correctsId !== null) {
    const reason = parseReason(formGetter(form)("correction_reason"), "correction");
    if (!reason.ok) return { error: reason.error };
    values.corrects_id = correctsId;
    values.correction_reason = reason.values;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from(REGISTER[kind].table).insert(values).select("first_id").single();
  if (error) return { error: friendlyRegisterError(error.message) };
  redirect(`/registers/${kind}/${data.first_id}?done=${correctsId === null ? "added" : "corrected"}`);
}

/** Cancels the newest version of an entry, with a reason. */
export async function cancelEntry(kind: RegisterKind, entryId: number, versionId: number, form: FormData): Promise<void> {
  if (anyBad(isRegisterKind(kind), isId(entryId), isId(versionId))) notFound();
  const reason = parseReason(formGetter(form)("reason"), "cancel");
  if (!reason.ok) redirect(`/registers/${kind}/${entryId}?done=cancel-reason`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(REGISTER[kind].table)
    .update({ cancelled_reason: reason.values })
    .eq("id", versionId)
    .eq("first_id", entryId)
    .select("id");
  if (error) redirect(`/registers/${kind}/${entryId}?done=cancel-refused`);
  if (!data?.length) redirect(`/registers/${kind}/${entryId}?done=not-allowed`);
  redirect(`/registers/${kind}/${entryId}?done=cancelled`);
}

/** The funeral form asks who the rota had on "Funeral on call" for the date picked. */
export async function onCallFor(day: string): Promise<string[]> {
  if (!isDate(day)) return [];
  const me = await requireAdmin();
  if (!MAY_SEE_REGISTERS.includes(me.roleCode)) return [];
  return onCallOn(await createClient(), day);
}
