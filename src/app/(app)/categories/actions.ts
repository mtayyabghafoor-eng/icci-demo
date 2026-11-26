"use server";
// What happens when the category forms are sent (slice P1.17). Runs on the
// web server as the signed-in admin: the database's rules decide what is
// allowed (who may add or change categories, two levels only, names unique
// across the list, nothing switched on inside a switched-off main category).
import { redirect } from "next/navigation";
import { friendlyCategoryError, parseCategoryForm } from "@/lib/categories/rules";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "./data";
import { formGetter } from "@/lib/forms";
import { NOT_FOUND, anyBad, isBool, isUuid, orNull } from "@/lib/action-input";

export type CategoryFormState = { error: string | null };

/** Adds a main category (no parent) or a sub-category inside a main one. */
export async function addCategory(parentId: string | null, _state: CategoryFormState, form: FormData): Promise<CategoryFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(orNull(isUuid)(parentId))) return { error: NOT_FOUND };
  const parsed = parseCategoryForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  if (parentId && !UUID.test(parentId)) return { error: "The main category to add it inside could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_categories")
    .insert({ ...parsed.values, parent_id: parentId })
    .select("id")
    .single();
  if (error) return { error: friendlyCategoryError(error.message) };
  redirect(`/categories/${data.id}?done=added`);
}

/** Renames a category; a sub-category may also move to another main category. */
export async function saveCategory(categoryId: string, _state: CategoryFormState, form: FormData): Promise<CategoryFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(categoryId))) return { error: NOT_FOUND };
  if (!UUID.test(categoryId)) return { error: "This category could not be found." };
  const get = formGetter(form);
  const parsed = parseCategoryForm(get);
  if (!parsed.ok) return { error: parsed.error };
  const values: { name: string; icon?: string; parent_id?: string; service_company_id?: string | null; contact_person_id?: string | null } = parsed.values;
  // P1.19: the usual service company and the person staff phone (both optional).
  for (const field of ["service_company_id", "contact_person_id"] as const) {
    if (!form.has(field)) continue;
    const v = get(field);
    if (v && !UUID.test(v)) return { error: "Choose from the list." };
    values[field] = v || null;
  }
  const parent = get("parent_id");
  if (parent) {
    if (!UUID.test(parent)) return { error: "Choose a main category from the list." };
    values.parent_id = parent;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("item_categories").update(values).eq("id", categoryId).select("id");
  if (error) return { error: friendlyCategoryError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/categories/${categoryId}?done=saved`);
}

export async function setCategoryActive(categoryId: string, active: boolean): Promise<CategoryFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(categoryId), isBool(active))) return { error: NOT_FOUND };
  if (!UUID.test(categoryId)) return { error: "This category could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("item_categories").update({ active }).eq("id", categoryId).select("id");
  if (error) return { error: friendlyCategoryError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/categories/${categoryId}?done=${active ? "switched-on" : "switched-off"}`);
}
