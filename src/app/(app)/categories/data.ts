// Reading categories for the category screens (slice P1.17) and their counts
// for "What we own" (P1.18). Row-level security decides what each account may
// see: Finance, the Library Operator and signed-out visitors get nothing.
import type { SupabaseClient } from "@supabase/supabase-js";
import { rollUp, type CategoryCount, type CategoryCountRow } from "@/lib/categories/counts";
import type { CategoryGroup, CategoryRow } from "@/lib/categories/rules";
import { allRows } from "@/lib/supabase/all-rows";

export const MAY_SEE_CATEGORIES = ["super_admin", "centre_admin"];

import { UUID } from "@/lib/forms";

export { UUID };

/** Every category, main and sub, switched off ones too. */
export async function allCategories(supabase: SupabaseClient): Promise<CategoryRow[]> {
  return allRows<CategoryRow>((from, to) =>
    supabase.from("item_categories").select("id, name, parent_id, active, icon, service_company_id, contact_person_id").order("id").range(from, to),
  );
}

/** How many of each kind the Centre has, for every sub-category and main category (optionally in one place). */
export async function categoryCounts(supabase: SupabaseClient, groups: CategoryGroup[], place?: string | null): Promise<Map<string, CategoryCount>> {
  const { data, error } = await supabase.rpc("category_counts", place ? { p_place: place } : {});
  if (error) throw new Error(error.message);
  return rollUp(groups, (data ?? []) as CategoryCountRow[]);
}
