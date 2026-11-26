"use server";
// What happens when the rota week forms are sent (slice P3.2). Runs on the
// web server as the signed-in admin: the database's rules decide what is
// allowed (Super Admin and Centre Admin only, no switched-off people or
// places, a week locked once its Sunday has passed, nothing typed over or
// deleted). Warnings never block.
import { notFound, redirect } from "next/navigation";
import { SLOT_GROUPS, type SlotGroup } from "@/lib/rota/rules";
import { publishProblem } from "@/lib/rota/publish";
import { friendlyWeekError, parseAddSlotForm } from "@/lib/rota/week";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/forms";
import { NOT_FOUND, anyBad, isDate, isId, isUuid, orNull } from "@/lib/action-input";

export type AddSlotState = { error: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Which short message the slot page shows after a refusal. */
function problemKey(message: string | undefined): string {
  if (!message) return "other";
  if (/has ended/i.test(message)) return "ended";
  if (/switched off/i.test(message)) return "switched-off";
  if (/already removed or replaced|not on the rota/i.test(message)) return "changed";
  if (/not allowed|row-level security|permission denied/i.test(message)) return "not-allowed";
  return "other";
}

export async function startWeek(monday: string): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isDate(monday))) notFound();
  if (!DATE.test(monday)) redirect("/rota");
  const supabase = await createClient();
  const { error } = await supabase.from("rota_weeks").insert({ week_start: monday });
  if (error) redirect(`/rota?week=${monday}&done=${/duplicate/i.test(error.message) ? "started" : problemKey(error.message)}`);
  redirect(`/rota?week=${monday}&done=started`);
}

export async function assignPerson(assignmentId: number, monday: string, personId: string | null): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isId(assignmentId), isDate(monday), orNull(isUuid)(personId))) notFound();
  if (!Number.isSafeInteger(assignmentId) || !DATE.test(monday) || (personId !== null && !UUID.test(personId))) redirect("/rota");
  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("assign_rota_person", { p_assignment_id: assignmentId, p_person_id: personId });
  if (error) redirect(`/rota/slot/${assignmentId}?problem=${problemKey(error.message)}`);
  // A7: when the same slot is empty on other days this week, stay on the slot
  // (its new entry: a change is always a new entry) so the person can be put
  // on those days too in one step.
  const slotNow = typeof newId === "number" ? newId : Number(newId);
  if (personId && Number.isSafeInteger(slotNow) && (await emptySameSlots(supabase, slotNow)) > 0) redirect(`/rota/slot/${slotNow}?done=assigned`);
  redirect(`/rota?week=${monday}&done=${personId ? "assigned" : "taken-off"}`);
}

/** How many slots of the same kind are still empty on the other days of this slot's week. */
async function emptySameSlots(supabase: Awaited<ReturnType<typeof createClient>>, assignmentId: number): Promise<number> {
  const { data: me } = await supabase.from("rota_entries").select("week_id, slot_type_id").eq("id", assignmentId).maybeSingle();
  if (!me) return 0;
  const { count } = await supabase
    .from("rota_entries")
    .select("id", { count: "exact", head: true })
    .eq("week_id", me.week_id)
    .eq("slot_type_id", me.slot_type_id)
    .is("person_id", null)
    .neq("id", assignmentId);
  return count ?? 0;
}

/**
 * A7 (owner, 25 Nov 2026): "Also put this person on" the same slot on other
 * days. Each day is saved as its own entry by the same database rule as one
 * slot; the week page says how many were saved and how many were refused.
 */
export async function assignMore(monday: string, personId: string, form: FormData): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isDate(monday), isUuid(personId))) notFound();
  if (!DATE.test(monday) || !UUID.test(personId)) redirect("/rota");
  const ids = [...new Set(form.getAll("slots").map(Number))].filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 14);
  if (ids.length === 0) redirect(`/rota?week=${monday}`);
  const supabase = await createClient();
  let saved = 0;
  for (const id of ids) {
    const { error } = await supabase.rpc("assign_rota_person", { p_assignment_id: id, p_person_id: personId });
    if (!error) saved += 1;
  }
  redirect(`/rota?week=${monday}&done=assigned-more&count=${saved}&failed=${ids.length - saved}`);
}

export async function removeSlot(assignmentId: number, monday: string): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isId(assignmentId), isDate(monday))) notFound();
  if (!Number.isSafeInteger(assignmentId) || !DATE.test(monday)) redirect("/rota");
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota_assignments").update({ removed_at: new Date().toISOString() }).eq("id", assignmentId).select("id");
  if (error) redirect(`/rota/slot/${assignmentId}?problem=${problemKey(error.message)}`);
  if (!data?.length) redirect(`/rota/slot/${assignmentId}?problem=not-allowed`);
  redirect(`/rota?week=${monday}&done=removed`);
}

export async function addSlot(weekId: string, monday: string, _state: AddSlotState, form: FormData): Promise<AddSlotState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(weekId), isDate(monday))) return { error: NOT_FOUND };
  if (!UUID.test(weekId) || !DATE.test(monday)) return { error: "This week could not be found." };
  const supabase = await createClient();
  const { data: types } = await supabase.from("rota_slot_types").select("id, slot_group").eq("active", true);
  const groupOf = new Map(
    ((types ?? []) as { id: string; slot_group: string }[])
      .filter((t) => (SLOT_GROUPS as readonly string[]).includes(t.slot_group))
      .map((t) => [t.id, t.slot_group as SlotGroup]),
  );
  const parsed = parseAddSlotForm((name) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  }, monday, groupOf);
  if (!parsed.ok) return { error: parsed.error };
  const { data, error } = await supabase.from("rota_assignments").insert({ week_id: weekId, ...parsed.values }).select("id");
  if (error) return { error: friendlyWeekError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/rota?week=${monday}&done=added`);
}

/**
 * Publish the week (slice P3.3). The database checks the role, the tick when
 * warnings are showing, and that the week has not ended; it also freezes the
 * copy that the one-page rota prints. Then the print view opens.
 */
export async function publishWeek(weekId: string, monday: string, form: FormData): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(weekId), isDate(monday))) notFound();
  if (!UUID.test(weekId) || !DATE.test(monday)) redirect("/rota");
  const seen = form.get("seen_warnings") === "yes";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_rota_week", { p_week_id: weekId, p_seen_warnings: seen });
  if (error || typeof data !== "number") redirect(`/rota/publish?week=${monday}&problem=${publishProblem(error?.message)}`);
  redirect(`/rota/print/${data}?new=1`);
}
