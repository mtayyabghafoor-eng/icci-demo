"use server";
// What happens when the register and edit forms are sent. Runs on the web
// server, as the signed-in admin: the database's rules decide what is allowed.
import { redirect } from "next/navigation";
import { warrantyEndFrom } from "@/lib/companies/rules";
import { friendlyDbError, parseEdit, parseRegister } from "@/lib/items/form";
import type { ItemKind } from "@/lib/items/rules";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { photoFrom, savePhoto } from "./photos";
import { insertNewItem } from "./register";
import { formGetter } from "@/lib/forms";
import { NOT_FOUND, anyBad, isUuid } from "@/lib/action-input";

export type ItemFormState = { error: string | null };

export async function registerItem(_state: ItemFormState, form: FormData): Promise<ItemFormState> {
  const parsed = parseRegister(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const photo = await photoFrom(form);
  if (typeof photo === "string") return { error: photo };

  const saved = await insertNewItem(await createClient(), parsed.values, photo);
  if (saved.error !== null) return { error: saved.error };
  redirect(`/items/${saved.id}?done=registered`);
}

export async function updateItem(id: string, _state: ItemFormState, form: FormData): Promise<ItemFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(id))) return { error: NOT_FOUND };
  const supabase = await createClient();
  const { data: item } = await supabase.from("items").select("id, kind, label_serial").eq("id", id).maybeSingle();
  if (!item) return { error: "This item could not be found." };

  // The database allows only these two kinds (a check on the items table).
  const parsed = parseEdit(formGetter(form), item.kind as ItemKind);
  if (!parsed.ok) return { error: parsed.error };
  const photo = await photoFrom(form);
  if (typeof photo === "string") return { error: photo };

  const changes: TablesUpdate<"items"> = { ...parsed.values };
  // P1.19: a make and model with a usual warranty fills in an empty warranty end date.
  if (parsed.values.model_id && parsed.values.purchase_date && !parsed.values.warranty_end) {
    const { data: model } = await supabase.from("product_models").select("warranty_months").eq("id", parsed.values.model_id).maybeSingle();
    if (model?.warranty_months) changes.warranty_end = warrantyEndFrom(parsed.values.purchase_date, model.warranty_months);
  }
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
