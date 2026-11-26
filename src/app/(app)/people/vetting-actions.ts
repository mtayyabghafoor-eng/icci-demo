"use server";
// What happens when the Garda vetting forms are sent (slice P2.3). Runs on
// the web server as the signed-in admin: the database's rules decide what is
// allowed (never your own vetting, no future dates, withdraw with a reason).
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyVettingError, parseVettingForm, parseWithdrawReason, todayInDublin } from "@/lib/vetting/rules";
import { UUID, formGetter } from "@/lib/forms";
import { NOT_FOUND, anyBad, isId, isUuid } from "@/lib/action-input";

export type VettingFormState = { error: string | null };

export async function recordVetting(personId: string, _state: VettingFormState, form: FormData): Promise<VettingFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(personId))) return { error: NOT_FOUND };
  if (!UUID.test(personId)) return { error: "This person could not be found." };
  const parsed = parseVettingForm(formGetter(form), todayInDublin());
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("vetting_records").insert({ person_id: personId, ...parsed.values });
  if (error) return { error: friendlyVettingError(error.message) };
  redirect(`/people/${personId}?done=vetting-recorded`);
}

export async function withdrawVetting(personId: string, recordId: number, form: FormData): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(personId), isId(recordId))) notFound();
  if (!UUID.test(personId) || !Number.isSafeInteger(recordId)) redirect("/people");
  const reason = parseWithdrawReason(formGetter(form)("reason"));
  if (!reason.ok) redirect(`/people/${personId}?done=withdraw-reason`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vetting_records")
    .update({ withdrawn_reason: reason.values })
    .eq("id", recordId)
    .eq("person_id", personId)
    .select("id");
  if (error) redirect(`/people/${personId}?done=${/your own/i.test(error.message) ? "own-vetting" : "withdraw-refused"}`);
  if (!data?.length) redirect(`/people/${personId}?done=not-allowed`);
  redirect(`/people/${personId}?done=vetting-withdrawn`);
}
