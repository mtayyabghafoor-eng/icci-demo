// A7: every square of the policy grid, page by page. One request returns at
// most 1,000 rows, so a large Centre would otherwise lose people silently.
import type { SupabaseClient } from "@supabase/supabase-js";
import { SQUARE_COLUMNS, type Square } from "@/lib/policies/signoffs";
import { allRows } from "@/lib/supabase/all-rows";

export async function loadGridSquares(supabase: SupabaseClient): Promise<Square[]> {
  return allRows<Square>((from, to) => supabase.from("policy_grid").select(SQUARE_COLUMNS).order("person_id").order("policy_id").range(from, to));
}
