"use server";
// What happens when the Templates forms are sent (slice P3.4). Runs on the
// web server as the signed-in admin: the database's rules decide what is
// allowed (Super Admin and Centre Admin only, the rota's own slot rules, a
// template never used on a week that already has people on it, nothing
// typed over or deleted).
import { notFound, redirect } from "next/navigation";
import { SLOT_GROUPS, type SlotGroup } from "@/lib/rota/rules";
import { friendlyTemplateError, parseTemplateSlotForm, type TemplateKind } from "@/lib/rota/templates";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/forms";
import { NOT_FOUND, anyBad, isBool, isDate, isId, isUuid } from "@/lib/action-input";

export type TemplateSlotState = { error: string | null };
export type UseTemplateState = { error: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function addTemplateSlot(templateId: string, _state: TemplateSlotState, form: FormData): Promise<TemplateSlotState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(templateId))) return { error: NOT_FOUND };
  if (!UUID.test(templateId)) return { error: "This template could not be found." };
  const supabase = await createClient();
  const [{ data: template }, { data: types }] = await Promise.all([
    supabase.from("rota_templates").select("kind").eq("id", templateId).maybeSingle(),
    supabase.from("rota_slot_types").select("id, slot_group").eq("active", true),
  ]);
  if (!template) return { error: "This template could not be found." };
  const groupOf = new Map(
    ((types ?? []) as { id: string; slot_group: string }[])
      .filter((t) => (SLOT_GROUPS as readonly string[]).includes(t.slot_group))
      .map((t) => [t.id, t.slot_group as SlotGroup]),
  );
  const parsed = parseTemplateSlotForm((name) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  }, template.kind as TemplateKind, groupOf);
  if (!parsed.ok) return { error: parsed.error };
  const rows = parsed.values.days.map((day_of_week) => ({ template_id: templateId, day_of_week, ...parsed.values.slot }));
  const { data, error } = await supabase.from("rota_template_slots").insert(rows).select("id");
  if (error) return { error: friendlyTemplateError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/rota/templates/${templateId}?done=added&count=${data.length}`);
}

export async function setTemplateSlotActive(templateId: string, slotId: number, active: boolean): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(templateId), isId(slotId), isBool(active))) notFound();
  if (!UUID.test(templateId) || !Number.isSafeInteger(slotId)) redirect("/rota/templates");
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota_template_slots").update({ active }).eq("id", slotId).eq("template_id", templateId).select("id");
  if (error || !data?.length) redirect(`/rota/templates/${templateId}?done=not-allowed`);
  redirect(`/rota/templates/${templateId}?done=${active ? "switched-on" : "switched-off"}`);
}

/** Use a template on a week; for an Eid template the form gives the day. Then back to the week. */
export async function applyTemplate(weekId: string, monday: string, templateId: string, _state: UseTemplateState, form: FormData): Promise<UseTemplateState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(weekId), isDate(monday), isUuid(templateId))) return { error: NOT_FOUND };
  if (!UUID.test(weekId) || !DATE.test(monday) || !UUID.test(templateId)) return { error: "This week or template could not be found." };
  const day = form.get("on_day");
  const p_day = typeof day === "string" && DATE.test(day) ? day : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("use_rota_template", { p_week_id: weekId, p_template_id: templateId, p_day });
  if (error || typeof data !== "number") return { error: friendlyTemplateError(error?.message) };
  redirect(`/rota?week=${monday}&done=template&count=${data}`);
}
