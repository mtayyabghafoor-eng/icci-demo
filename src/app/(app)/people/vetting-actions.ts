"use server";
// What happens when the Garda vetting forms are sent (slice P2.3). Runs on
// the web server as the signed-in admin: the database's rules decide what is
// allowed (never your own vetting, no future dates, withdraw with a reason).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyVettingError, parseVettingForm, parseWithdrawReason, todayInDublin } from "@/lib/vetting/rules";

export type VettingFormState = { error: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getter(form: FormData) {
  return (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
}

export async function recordVetting(personId: string, _state: VettingFormState, form: FormData): Promise<VettingFormState> {
  if (!UUID.test(personId)) return { error: "This person could not be found." };
  const parsed = parseVettingForm(getter(form), todayInDublin());
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("vetting_records").insert({ person_id: personId, ...parsed.values });
  if (error) return { error: friendlyVettingError(error.message) };
  redirect(`/people/${personId}?done=vetting-recorded`);
}

export async function withdrawVetting(personId: string, recordId: number, form: FormData): Promise<void> {
  if (!UUID.test(personId) || !Number.isSafeInteger(recordId)) redirect("/people");
  const reason = parseWithdrawReason(getter(form)("reason"));
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
