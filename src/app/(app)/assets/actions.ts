"use server";
// What happens when an asset form is sent (move, report damage, mark missing,
// mark found or repaired, dispose) and when a disposal is decided. Runs on
// the web server as the signed-in admin: the database's rules decide what is
// allowed, including that nobody approves their own disposal.
import { parseDisposalFields } from "@/lib/assets/disposal";
import { redirect } from "next/navigation";
import { friendlyAssetError, isAssetAction, parseAssetForm } from "@/lib/assets/rules";
import { createClient } from "@/lib/supabase/server";
import { photoFrom, savePhoto } from "../items/photos";
import { formGetter } from "@/lib/forms";

export type AssetFormState = { error: string | null };

export async function recordAssetEvent(
  itemId: string,
  action: string,
  _state: AssetFormState,
  form: FormData,
): Promise<AssetFormState> {
  if (!isAssetAction(action)) return { error: "Unknown action." };
  const parsed = parseAssetForm(formGetter(form), action);
  if (!parsed.ok) return { error: parsed.error };
  // Slice P1.14: a disposal says how the item leaves.
  const route = action === "dispose" ? parseDisposalFields(formGetter(form)) : null;
  if (route && !route.ok) return { error: route.error };
  const photo = photoFrom(form);
  if (typeof photo === "string") return { error: photo };

  const supabase = await createClient();
  const { data: item } = await supabase.from("items").select("id, label_serial").eq("id", itemId).maybeSingle();
  if (!item) return { error: "This item could not be found." };

  let photo_path: string | null = null;
  if (photo) {
    photo_path = await savePhoto(supabase, item.label_serial, photo, "events");
    if (!photo_path) return { error: "The photo could not be saved. Please try again, or send without a photo." };
  }

  const { error } = await supabase.from("asset_events").insert({ item_id: itemId, ...parsed.values, ...(route?.ok ? route.values : {}), photo_path });
  if (error) return { error: friendlyAssetError(error.message) };
  redirect(`/items/${itemId}?done=${action}`);
}

/** Approve or reject a disposal. The database refuses if it is your own. */
export async function decideDisposal(eventId: number, _state: AssetFormState, form: FormData): Promise<AssetFormState> {
  const decision = formGetter(form)("decision");
  if (decision !== "approved" && decision !== "rejected") return { error: "Choose Approve or Reject." };
  const note = formGetter(form)("note").trim();
  if (decision === "rejected" && !note) return { error: "Write why you are rejecting it." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("asset_events")
    .update({ status: decision, decision_note: note || null })
    .eq("id", eventId)
    .select("id");
  if (error) return { error: friendlyAssetError(error.message) };
  if (!data?.length) return { error: "This disposal has already been decided, or your account cannot decide it." };
  redirect(`/assets/approvals?done=${decision}`);
}
