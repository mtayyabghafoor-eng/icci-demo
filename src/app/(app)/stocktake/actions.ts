"use server";
// What happens when a stocktake form is sent. Runs on the web server as the
// signed-in admin: the database's rules decide what is allowed (who may run a
// stocktake, what counts as a difference, and that nobody approves a
// stocktake they took part in).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseLabelNumber } from "@/lib/items/rules";
import { parseQuantity } from "@/lib/stock/rules";
import { friendlyStocktakeError, SCANNING_COOKIE } from "@/lib/stocktake/rules";
import { createClient } from "@/lib/supabase/server";

export type StocktakeFormState = { error: string | null };

function text(form: FormData, name: string) {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

/** Remembers, in this browser only, which stocktake a scanned label belongs to (12 hours). */
async function rememberScanning(stocktakeId: number) {
  (await cookies()).set(SCANNING_COOKIE, String(stocktakeId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
  });
}

export async function startStocktake(_state: StocktakeFormState, form: FormData): Promise<StocktakeFormState> {
  const roomId = text(form, "room");
  if (!roomId) return { error: "Pick a room." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("stocktakes").insert({ location_id: roomId }).select("id").single();
  if (error) return { error: friendlyStocktakeError(error.message) };
  await rememberScanning(data.id);
  redirect(`/stocktake/${data.id}`);
}

/** "Carry on scanning": labels scanned with the phone's camera come back to this stocktake. */
export async function carryOn(stocktakeId: number) {
  await rememberScanning(stocktakeId);
  redirect(`/stocktake/${stocktakeId}`);
}

/** "Stop scanning": labels open their item again, as normal. */
export async function stopScanning(stocktakeId: number) {
  (await cookies()).delete(SCANNING_COOKIE);
  redirect(`/stocktake/${stocktakeId}`);
}

/** A typed label number: open the scan screen for it. */
export async function openLabel(stocktakeId: number, _state: StocktakeFormState, form: FormData): Promise<StocktakeFormState> {
  const serial = parseLabelNumber(text(form, "label"));
  if (!serial) return { error: "That is not a label number. Type it like ICCI-000123, or just 123." };
  redirect(`/stocktake/${stocktakeId}/scan?label=${serial}`);
}

/** Records one scan: "Seen here" for an asset, or the number found on a shelf. */
export async function recordScan(
  stocktakeId: number,
  serial: string,
  kind: "fixed_asset" | "consumable" | "unknown",
  _state: StocktakeFormState,
  form: FormData,
): Promise<StocktakeFormState> {
  let found_quantity: number | undefined;
  if (kind === "consumable") {
    const q = parseQuantity(text(form, "quantity"), "count");
    if (!q.ok) return { error: q.error };
    found_quantity = q.value;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("stocktake_scans")
    .insert({ stocktake_id: stocktakeId, label_serial: serial, ...(found_quantity === undefined ? {} : { found_quantity }) });
  if (error) return { error: friendlyStocktakeError(error.message) };
  await rememberScanning(stocktakeId);
  redirect(`/stocktake/${stocktakeId}?saved=${serial}`);
}

export async function submitStocktake(stocktakeId: number): Promise<StocktakeFormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_stocktake", { p_stocktake_id: stocktakeId });
  if (error) return { error: friendlyStocktakeError(error.message) };
  (await cookies()).delete(SCANNING_COOKIE);
  redirect(`/stocktake/${stocktakeId}?done=sent`);
}

/** Approve or reject one difference. The database refuses if you took part. */
export async function decideDifference(
  stocktakeId: number,
  differenceId: number,
  _state: StocktakeFormState,
  form: FormData,
): Promise<StocktakeFormState> {
  const decision = text(form, "decision");
  if (decision !== "approved" && decision !== "rejected") return { error: "Choose Approve or Reject." };
  const note = text(form, "note").trim();
  if (decision === "rejected" && !note) return { error: "Write why you are rejecting it." };
  const condition = text(form, "found_condition");
  const found_condition = decision === "approved" && (condition === "good" || condition === "fair") ? condition : null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stocktake_differences")
    .update({ status: decision, decision_note: note || null, ...(found_condition ? { found_condition } : {}) })
    .eq("id", differenceId)
    .select("id");
  if (error) return { error: friendlyStocktakeError(error.message) };
  if (!data?.length) return { error: "This difference has already been decided, or your account cannot decide it." };
  redirect(`/stocktake/${stocktakeId}?done=${decision}#difference-${differenceId}`);
}
