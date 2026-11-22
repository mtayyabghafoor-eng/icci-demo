"use server";
// What happens when the Prayer times and Slot types forms are sent (slice
// P3.1). Runs on the web server as the signed-in admin: the database's rules
// decide what is allowed (Super Admin and Centre Admin only, prayers in
// order, Jumu'ah on Fridays only, a slot's group never changes, nothing
// deleted).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  friendlyRotaError,
  monthDays,
  parsePrayerMonth,
  parseSlotTypeForm,
  PRAYER_DAY_COLUMNS,
  toDayTimes,
  type DayTimes,
  type PrayerDay,
} from "@/lib/rota/rules";
import { UUID, formGetter } from "@/lib/forms";

/** On a refusal the typed values come back, so a month of typing is never lost. */
export type MonthFormState = { error: string | null; values: Record<string, string> | null };
export type SlotFormState = { error: string | null };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SLOTS = "/rota/slot-types";

function typed(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && k.includes(":")) out[k] = v;
  return out;
}

export async function savePrayerMonth(month: string, _state: MonthFormState, form: FormData): Promise<MonthFormState> {
  if (!MONTH.test(month)) return { error: "That month could not be found.", values: null };
  const supabase = await createClient();
  const days = monthDays(month);
  const { data, error: readError } = await supabase
    .from("prayer_times")
    .select(PRAYER_DAY_COLUMNS)
    .gte("prayer_date", days[0])
    .lte("prayer_date", days.at(-1)!);
  if (readError) return { error: friendlyRotaError(readError.message), values: typed(form) };
  const existing = new Map(((data ?? []) as PrayerDay[]).map((r) => [r.prayer_date, toDayTimes(r) as DayTimes]));

  const parsed = parsePrayerMonth(month, formGetter(form), existing);
  if (!parsed.ok) return { error: parsed.error, values: typed(form) };
  const { data: result, error } = await supabase.rpc("save_prayer_month", { p_month: `${month}-01`, p_days: parsed.values });
  if (error) return { error: friendlyRotaError(error.message), values: typed(form) };
  const { added, changed } = result as { added: number; changed: number };
  redirect(`/rota/prayer-times?month=${month}&done=saved&added=${added}&changed=${changed}`);
}

export async function addSlotType(_state: SlotFormState, form: FormData): Promise<SlotFormState> {
  const parsed = parseSlotTypeForm(formGetter(form), "add");
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota_slot_types").insert(parsed.values).select("id");
  if (error) return { error: friendlyRotaError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${SLOTS}?done=added`);
}

export async function saveSlotType(id: string, _state: SlotFormState, form: FormData): Promise<SlotFormState> {
  if (!UUID.test(id)) return { error: "This slot type could not be found." };
  const parsed = parseSlotTypeForm(formGetter(form), "edit");
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota_slot_types").update(parsed.values).eq("id", id).select("id");
  if (error) return { error: friendlyRotaError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${SLOTS}?done=saved`);
}

export async function setSlotTypeActive(id: string, active: boolean): Promise<void> {
  if (!UUID.test(id)) redirect(SLOTS);
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota_slot_types").update({ active }).eq("id", id).select("id");
  if (error || !data?.length) redirect(`${SLOTS}?done=not-allowed`);
  redirect(`${SLOTS}?done=${active ? "switched-on" : "switched-off"}`);
}

export async function moveSlotType(id: string, direction: "up" | "down"): Promise<void> {
  if (!UUID.test(id) || (direction !== "up" && direction !== "down")) redirect(SLOTS);
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_rota_slot_type", { p_id: id, p_direction: direction });
  if (error) redirect(`${SLOTS}?done=not-allowed`);
  redirect(`${SLOTS}?done=moved`);
}
