// Saving a new item, shared by "Register an item" and "Register a room"
// (slice P1.13), so both follow exactly the same checks. Runs on the web
// server as the signed-in admin; the database's own rules still decide.
// Not a server action itself: only the forms' actions call it.
import { friendlyDbError, type RegisterValues } from "@/lib/items/form";
import type { createClient } from "@/lib/supabase/server";
import { savePhoto } from "./photos";

type Db = Awaited<ReturnType<typeof createClient>>;

export async function insertNewItem(
  supabase: Db,
  values: RegisterValues,
  photo: File | null,
): Promise<{ id: string; error: null } | { id: null; error: string }> {
  const { data: label } = await supabase.from("labels").select("serial").eq("serial", values.label_serial).maybeSingle();
  if (!label) return { id: null, error: "That label number is not on the list of printed labels." };
  const { data: taken } = await supabase.from("items").select("id").eq("label_serial", values.label_serial).maybeSingle();
  if (taken) return { id: null, error: "This label is already on another item." };

  let photo_path: string | null = null;
  if (photo) {
    photo_path = await savePhoto(supabase, values.label_serial, photo);
    if (!photo_path) return { id: null, error: "The photo could not be saved. Please try again, or register without a photo." };
  }

  const { data, error } = await supabase.from("items").insert({ ...values, photo_path }).select("id").single();
  if (error || !data) return { id: null, error: friendlyDbError(error?.message) };
  return { id: data.id as string, error: null };
}
