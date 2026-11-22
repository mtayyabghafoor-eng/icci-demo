"use server";
// What happens when "Report a problem" is sent. Runs on the web server as the
// signed-in admin: the database's rules decide what is allowed (no
// consumables, no disposed assets, no switched-off places).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyTicketError, isTicketStep, parseStepForm, parseTicketForm } from "@/lib/tickets/rules";
import { photoFrom } from "../items/photos";
import { TICKET_PHOTO_BUCKET } from "./data";

export type TicketFormState = { error: string | null };

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function reportProblem(
  itemId: string | null,
  damageId: number | null,
  _state: TicketFormState,
  form: FormData,
): Promise<TicketFormState> {
  const get = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  const parsed = parseTicketForm(get, itemId);
  if (!parsed.ok) return { error: parsed.error };
  const photo = photoFrom(form);
  if (typeof photo === "string") return { error: photo };

  const supabase = await createClient();
  let photo_path: string | null = null;
  if (photo) {
    // A new file every time, never replaced or deleted.
    const path = `tickets/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${EXT[photo.type]}`;
    const { error } = await supabase.storage.from(TICKET_PHOTO_BUCKET).upload(path, photo, { contentType: photo.type });
    if (error) return { error: "The photo could not be saved. Please try again, or send without a photo." };
    photo_path = path;
  }

  const { data, error } = await supabase
    .from("maintenance_tickets")
    .insert({ ...parsed.values, photo_path, asset_event_id: itemId && Number.isSafeInteger(damageId) ? damageId : null })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyTicketError(error?.message) };
  redirect(`/tickets/${data.id}?done=reported`);
}

/**
 * One step on a ticket's page (P3.6): assign, change status or priority, add
 * a note (with an optional photo), close, or reopen. Each is a new history
 * entry; the database moves the ticket on from it and refuses anything not
 * allowed (for example closing a ticket twice).
 */
export async function recordTicketStep(ticketId: number, step: string, _state: TicketFormState, form: FormData): Promise<TicketFormState> {
  if (!isTicketStep(step)) return { error: "Unknown step." };
  const get = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  const parsed = parseStepForm(step, get);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.values;

  const supabase = await createClient();
  let error: { message: string } | null = null;
  if (v.step === "close") {
    ({ error } = await supabase.rpc("close_maintenance_ticket", {
      p_ticket_id: ticketId,
      p_note: v.note,
      p_cost_cents: v.costCents,
      p_repaired_condition: v.repaired,
    }));
  } else {
    let photo_path: string | null = null;
    if (v.step === "note") {
      const photo = photoFrom(form);
      if (typeof photo === "string") return { error: photo };
      if (photo) {
        const path = `tickets/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${EXT[photo.type]}`;
        const up = await supabase.storage.from(TICKET_PHOTO_BUCKET).upload(path, photo, { contentType: photo.type });
        if (up.error) return { error: "The photo could not be saved. Please try again, or send without a photo." };
        photo_path = path;
      }
    }
    const row =
      v.step === "assign"
        ? { kind: "assigned", new_assignee_person_id: v.person, note: v.note }
        : v.step === "status"
          ? { kind: "status", new_status: v.status, note: v.note }
          : v.step === "priority"
            ? { kind: "priority", new_priority: v.priority, note: v.note }
            : v.step === "note"
              ? { kind: "note", note: v.note, photo_path }
              : v.step === "refer"
                ? { kind: "referred", company_id: v.company, company_job_ref: v.jobRef, note: v.note }
                : { kind: "reopened", note: v.note };
    ({ error } = await supabase.from("maintenance_ticket_events").insert({ ticket_id: ticketId, ...row }));
  }
  if (error) return { error: friendlyTicketError(error.message) };
  redirect(`/tickets/${ticketId}?done=${step}`);
}
