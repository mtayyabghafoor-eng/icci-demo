"use server";
// What happens when the training forms are sent (slice P2.4). Runs on the
// web server as the signed-in admin: the database's rules decide what is
// allowed (never your own training, no future dates, withdraw with a reason,
// no new entries for switched-off people or types).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyTrainingError, parseTrainingForm, parseTrainingTypeForm } from "@/lib/training/rules";
import { parseWithdrawReason, todayInDublin } from "@/lib/vetting/rules";
import { UUID, formGetter } from "@/lib/forms";

export type TrainingFormState = { error: string | null };

const TYPES = "/people/training/types";

export async function recordTraining(personId: string, _state: TrainingFormState, form: FormData): Promise<TrainingFormState> {
  if (!UUID.test(personId)) return { error: "This person could not be found." };
  const parsed = parseTrainingForm(formGetter(form), todayInDublin());
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("training_records").insert({ person_id: personId, ...parsed.values });
  if (error) return { error: friendlyTrainingError(error.message) };
  redirect(`/people/${personId}?done=training-recorded`);
}

export async function withdrawTraining(personId: string, recordId: number, form: FormData): Promise<void> {
  if (!UUID.test(personId) || !Number.isSafeInteger(recordId)) redirect("/people");
  const reason = parseWithdrawReason(formGetter(form)("reason"));
  if (!reason.ok) redirect(`/people/${personId}?done=withdraw-reason`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_records")
    .update({ withdrawn_reason: reason.values })
    .eq("id", recordId)
    .eq("person_id", personId)
    .select("id");
  if (error) redirect(`/people/${personId}?done=${/your own/i.test(error.message) ? "own-training" : "withdraw-refused"}`);
  if (!data?.length) redirect(`/people/${personId}?done=not-allowed`);
  redirect(`/people/${personId}?done=training-withdrawn`);
}

export async function addTrainingType(_state: TrainingFormState, form: FormData): Promise<TrainingFormState> {
  const parsed = parseTrainingTypeForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("training_types").insert(parsed.values).select("id");
  if (error) return { error: friendlyTrainingError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${TYPES}?done=added`);
}

export async function saveTrainingType(typeId: string, _state: TrainingFormState, form: FormData): Promise<TrainingFormState> {
  if (!UUID.test(typeId)) return { error: "This training type could not be found." };
  const parsed = parseTrainingTypeForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("training_types").update(parsed.values).eq("id", typeId).select("id");
  if (error) return { error: friendlyTrainingError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${TYPES}?done=saved`);
}

export async function setTrainingTypeActive(typeId: string, active: boolean): Promise<void> {
  if (!UUID.test(typeId)) redirect(TYPES);
  const supabase = await createClient();
  const { data, error } = await supabase.from("training_types").update({ active }).eq("id", typeId).select("id");
  if (error || !data?.length) redirect(`${TYPES}?done=not-allowed`);
  redirect(`${TYPES}?done=${active ? "switched-on" : "switched-off"}`);
}
