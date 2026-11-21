// Reading categories for the category screens (slice P1.17). Row-level
// security decides what each account may see: Finance, the Library Operator
// and signed-out visitors get nothing.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryRow } from "@/lib/categories/rules";
import { allRows } from "@/lib/supabase/all-rows";

export const MAY_SEE_CATEGORIES = ["super_admin", "centre_admin"];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every category, main and sub, switched off ones too. */
export async function allCategories(supabase: SupabaseClient): Promise<CategoryRow[]> {
  return allRows<CategoryRow>((from, to) =>
    supabase.from("item_categories").select("id, name, parent_id, active").order("id").range(from, to),
  );
}
