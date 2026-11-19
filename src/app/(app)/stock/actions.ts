"use server";
// What happens when a stock form is sent. Runs on the web server as the
// signed-in admin: the database's rules decide what is allowed (who may
// enter stock, the arithmetic, and that nobody approves their own entry).
import { redirect } from "next/navigation";
import { friendlyStockError, parseQuantity, parseReason } from "@/lib/stock/rules";
import { createClient } from "@/lib/supabase/server";

export type StockFormState = { error: string | null; fieldErrors?: Record<string, string> };

function text(form: FormData, name: string) {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

/** One count or one restock of one item (from the item's own page, after scanning). */
export async function recordOne(
  itemId: string,
  kind: "count" | "restock",
  _state: StockFormState,
  form: FormData,
): Promise<StockFormState> {
  const q = parseQuantity(text(form, "quantity"), kind);
  if (!q.ok) return { error: q.error };
  const supabase = await createClient();
  const { error } = await supabase.from("stock_movements").insert({ item_id: itemId, kind, quantity: q.value });
  if (error) return { error: friendlyStockError(error.message) };
  redirect(`/items/${itemId}?done=${kind === "count" ? "counted" : "restocked"}`);
}

/** The weekly count of a store room: every box filled in is saved together. */
export async function recordWeeklyCount(roomId: string, _state: StockFormState, form: FormData): Promise<StockFormState> {
  const rows: { item_id: string; kind: "count"; quantity: number }[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("qty:") || typeof value !== "string" || value.trim() === "") continue;
    const itemId = key.slice(4);
    const q = parseQuantity(value, "count");
    if (q.ok) rows.push({ item_id: itemId, kind: "count", quantity: q.value });
    else fieldErrors[itemId] = q.error;
  }
  if (Object.keys(fieldErrors).length) {
    return { error: "Some numbers need fixing. Nothing has been saved yet.", fieldErrors };
  }
  if (!rows.length) return { error: "Enter at least one number. Leave a box empty to skip that shelf." };

  const supabase = await createClient();
  // One statement: either every count is saved, or none is.
  const { error } = await supabase.from("stock_movements").insert(rows);
  if (error) return { error: friendlyStockError(error.message) };
  redirect(`/stock/count?room=${roomId}&saved=${rows.length}`);
}

/** Ask for a correction of one earlier count or restock. */
export async function requestCorrection(
  itemId: string,
  entryId: number,
  _state: StockFormState,
  form: FormData,
): Promise<StockFormState> {
  const q = parseQuantity(text(form, "quantity"), "correction");
  if (!q.ok) return { error: q.error };
  const r = parseReason(text(form, "reason"));
  if (!r.ok) return { error: r.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("stock_movements")
    .insert({ item_id: itemId, kind: "adjustment", corrects_id: entryId, quantity: q.value, reason: r.value });
  if (error) return { error: friendlyStockError(error.message) };
  redirect(`/items/${itemId}?done=correction`);
}

/** Approve or reject a correction. The database refuses if it is your own. */
export async function decideCorrection(adjustmentId: number, _state: StockFormState, form: FormData): Promise<StockFormState> {
  const decision = text(form, "decision");
  if (decision !== "approved" && decision !== "rejected") return { error: "Choose Approve or Reject." };
  const note = text(form, "note").trim();
  if (decision === "rejected" && !note) return { error: "Write why you are rejecting it." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .update({ status: decision, decision_note: note || null })
    .eq("id", adjustmentId)
    .select("id");
  if (error) return { error: friendlyStockError(error.message) };
  if (!data?.length) return { error: "This correction has already been decided, or your account cannot decide it." };
  redirect(`/stock/approvals?done=${decision}`);
}
