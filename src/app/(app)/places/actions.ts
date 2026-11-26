"use server";
// What happens when the place forms are sent (slice P1.12). Runs on the web
// server as the signed-in admin: the database's rules decide what is allowed
// (who may add or change places, building > room > store room > shelf, names
// unique in the same spot, nothing switched off while it still holds things).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CHILD_KIND, friendlyPlaceError, isPlaceKind, parsePlaceForm } from "@/lib/places/rules";
import { UUID, formGetter } from "@/lib/forms";
import { NOT_FOUND, anyBad, isBool, isUuid, orNull } from "@/lib/action-input";

export type PlaceFormState = { error: string | null };

/** Adds a building (no parent) or the next kind of place inside a parent. */
export async function addPlace(parentId: string | null, _state: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(orNull(isUuid)(parentId))) return { error: NOT_FOUND };
  const parsed = parsePlaceForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  let kind = "building";
  if (parentId) {
    if (!UUID.test(parentId)) return { error: "The place to add it inside could not be found." };
    const { data: parent } = await supabase.from("locations").select("kind").eq("id", parentId).maybeSingle();
    const child = parent && isPlaceKind(parent.kind) ? CHILD_KIND[parent.kind] : null;
    if (!child) return { error: "Nothing can be added inside that place." };
    kind = child;
  }
  const { data, error } = await supabase
    .from("locations")
    .insert({ ...parsed.values, kind, parent_id: parentId })
    .select("id")
    .single();
  if (error) return { error: friendlyPlaceError(error.message) };
  redirect(`/places/${data.id}?done=added`);
}

export async function savePlace(placeId: string, _state: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(placeId))) return { error: NOT_FOUND };
  if (!UUID.test(placeId)) return { error: "This place could not be found." };
  const parsed = parsePlaceForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("locations").update(parsed.values).eq("id", placeId).select("id");
  if (error) return { error: friendlyPlaceError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/places/${placeId}?done=saved`);
}

export async function setPlaceActive(placeId: string, active: boolean): Promise<PlaceFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(placeId), isBool(active))) return { error: NOT_FOUND };
  if (!UUID.test(placeId)) return { error: "This place could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("locations").update({ active }).eq("id", placeId).select("id");
  if (error) return { error: friendlyPlaceError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/places/${placeId}?done=${active ? "switched-on" : "switched-off"}`);
}
