"use server";
// What happens when "Create and print" or "Print again" is pressed. Runs on
// the web server as the signed-in admin. Only the database hands out label
// numbers, and it decides who may print.
import { redirect } from "next/navigation";
import { friendlyLabelError, parsePrintCount } from "@/lib/labels/sheet";
import { createClient } from "@/lib/supabase/server";
import { NOT_FOUND, anyBad, isId } from "@/lib/action-input";

export type LabelFormState = { error: string | null };

export async function createLabelSheet(_state: LabelFormState, form: FormData): Promise<LabelFormState> {
  const raw = form.get("count");
  const parsed = parsePrintCount(typeof raw === "string" ? raw : "");
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("print_new_labels", { p_count: parsed.value });
  if (error || !data) return { error: friendlyLabelError(error?.message ?? "") };
  redirect(`/labels/sheet/${(data as { id: number }).id}?new=1`);
}

export async function reprintLabelSheet(runId: number): Promise<LabelFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isId(runId))) return { error: NOT_FOUND };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reprint_labels", { p_run_id: runId });
  if (error || !data) return { error: friendlyLabelError(error?.message ?? "") };
  redirect(`/labels/sheet/${(data as { id: number }).id}`);
}
