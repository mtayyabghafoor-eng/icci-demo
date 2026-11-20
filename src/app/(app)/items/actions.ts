"use server";
// What happens when the register and edit forms are sent. Runs on the web
// server, as the signed-in admin: the database's rules decide what is allowed.
import { redirect } from "next/navigation";
import { friendlyDbError, parseEdit, parseRegister } from "@/lib/items/form";
import { createClient } from "@/lib/supabase/server";
import { photoFrom, savePhoto } from "./photos";
import { insertNewItem } from "./register";

export type ItemFormState = { error: string | null };

function getter(form: FormData) {
  return (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
}

export async function registerItem(_state: ItemFormState, form: FormData): Promise<ItemFormState> {
  const parsed = parseRegister(getter(form));
  if (!parsed.ok) return { error: parsed.error };
  const photo = photoFrom(form);
  if (typeof photo === "string") return { error: photo };

  const saved = await insertNewItem(await createClient(), parsed.values, photo);
  if (saved.error !== null) return { error: saved.error };
  redirect(`/items/${saved.id}?done=registered`);
}

export async function updateItem(id: string, _state: ItemFormState, form: FormData): Promise<ItemFormState> {
  const supabase = await createClient();
  const { data: item } = await supabase.from("items").select("id, kind, label_serial").eq("id", id).maybeSingle();
  if (!item) return { error: "This item could not be found." };

  const parsed = parseEdit(getter(form), item.kind);
  if (!parsed.ok) return { error: parsed.error };
  const photo = photoFrom(form);
  if (typeof photo === "string") return { error: photo };

  const changes: Record<string, unknown> = { ...parsed.values };
  if (photo) {
    const path = await savePhoto(supabase, item.label_serial, photo);
    if (!path) return { error: "The photo could not be saved. Please try again." };
    changes.photo_path = path;
  }

  const { data, error } = await supabase.from("items").update(changes).eq("id", id).select("id");
  if (error) return { error: friendlyDbError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/items/${id}?done=saved`);
}
