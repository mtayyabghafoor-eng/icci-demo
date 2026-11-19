"use server";
// What happens when the renewal forms are sent (slice P2.8). Runs on the web
// server as the signed-in admin: the database's rules decide what is allowed
// (a switched-on owner or nobody, no future renewal dates, due dates never
// changed or deleted, a wrong one withdrawn with a reason).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyRenewalError, parseDueDate, parseRenewalDetails, parseRenewedForm } from "@/lib/renewals/rules";
import { parseWithdrawReason, todayInDublin } from "@/lib/vetting/rules";

export type RenewalFormState = { error: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getter(form: FormData) {
  return (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
}

export async function addRenewal(_state: RenewalFormState, form: FormData): Promise<RenewalFormState> {
  const get = getter(form);
  const parsed = parseRenewalDetails(get);
  if (!parsed.ok) return { error: parsed.error };
  const due = parseDueDate(get("due_on"), todayInDublin());
  if (!due.ok) return { error: due.error };
  const supabase = await createClient();
  const v = parsed.values;
  const { data, error } = await supabase.rpc("add_renewal", {
    p_title: v.title,
    p_category: v.category,
    p_owner_person_id: v.owner_person_id,
    p_documents_needed: v.documents_needed,
    p_notes: v.notes,
    p_due_on: due.values,
  });
  if (error || !data) return { error: friendlyRenewalError(error?.message) };
  redirect(`/renewals/${data as string}?done=added`);
}

export async function saveRenewal(renewalId: string, _state: RenewalFormState, form: FormData): Promise<RenewalFormState> {
  if (!UUID.test(renewalId)) return { error: "This renewal could not be found." };
  const parsed = parseRenewalDetails(getter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("renewals").update(parsed.values).eq("id", renewalId).select("id");
  if (error) return { error: friendlyRenewalError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/renewals/${renewalId}?done=saved`);
}

export async function setRenewalActive(renewalId: string, active: boolean): Promise<void> {
  if (!UUID.test(renewalId)) redirect("/renewals");
  const supabase = await createClient();
  const { data, error } = await supabase.from("renewals").update({ active }).eq("id", renewalId).select("id");
  if (error || !data?.length) redirect(`/renewals/${renewalId}?done=not-allowed`);
  redirect(`/renewals/${renewalId}?done=${active ? "switched-on" : "switched-off"}`);
}

export async function markRenewed(renewalId: string, _state: RenewalFormState, form: FormData): Promise<RenewalFormState> {
  if (!UUID.test(renewalId)) return { error: "This renewal could not be found." };
  const parsed = parseRenewedForm(getter(form), todayInDublin());
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("renewal_dates").insert({ renewal_id: renewalId, ...parsed.values });
  if (error) return { error: friendlyRenewalError(error.message) };
  redirect(`/renewals/${renewalId}?done=renewed`);
}

export async function withdrawDueDate(renewalId: string, entryId: number, form: FormData): Promise<void> {
  if (!UUID.test(renewalId) || !Number.isSafeInteger(entryId)) redirect("/renewals");
  const reason = parseWithdrawReason(getter(form)("reason"));
  if (!reason.ok) redirect(`/renewals/${renewalId}?done=withdraw-reason`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("renewal_dates")
    .update({ withdrawn_reason: reason.values })
    .eq("id", entryId)
    .eq("renewal_id", renewalId)
    .select("id");
  if (error) redirect(`/renewals/${renewalId}?done=withdraw-refused`);
  if (!data?.length) redirect(`/renewals/${renewalId}?done=not-allowed`);
  redirect(`/renewals/${renewalId}?done=withdrawn`);
}
