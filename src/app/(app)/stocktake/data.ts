// Reading stocktakes, as the signed-in admin (the database's own rules apply:
// Finance and others see nothing).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DifferenceKind, DifferenceStatus } from "@/lib/stocktake/rules";

export type Stocktake = {
  id: number;
  location_id: string;
  status: "open" | "submitted";
  created_by: string | null;
  created_at: string;
  submitted_by: string | null;
  submitted_at: string | null;
};
export const STOCKTAKE_COLUMNS = "id, location_id, status, created_by, created_at, submitted_by, submitted_at";

export type Scan = {
  id: number;
  label_serial: string;
  item_id: string | null;
  found_quantity: number | null;
  created_by: string | null;
  created_at: string;
};

export type Difference = {
  id: number;
  item_id: string;
  kind: DifferenceKind;
  expected_location_id: string | null;
  expected_quantity: number | null;
  found_quantity: number | null;
  status: DifferenceStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  found_condition: "good" | "fair" | null;
};

export type ItemBrief = {
  id: string;
  name: string;
  label_serial: string;
  kind: "fixed_asset" | "consumable";
  condition: string | null;
  location_id: string;
  unit: string | null;
};
export const ITEM_BRIEF = "id, name, label_serial, kind, condition, location_id, unit";

export async function loadStocktake(supabase: SupabaseClient, id: number) {
  const { data } = await supabase.from("stocktakes").select(STOCKTAKE_COLUMNS).eq("id", id).maybeSingle();
  return (data as Stocktake | null) ?? null;
}

/** The latest scan of each item (a shelf scanned twice: the latest number counts), plus unknown labels. */
export async function loadScans(supabase: SupabaseClient, stocktakeId: number) {
  const { data } = await supabase
    .from("stocktake_scans")
    .select("id, label_serial, item_id, found_quantity, created_by, created_at")
    .eq("stocktake_id", stocktakeId)
    .order("id", { ascending: false });
  const all = (data ?? []) as Scan[];
  const seen = new Set<string>();
  const latest: Scan[] = [];
  for (const s of all) {
    const key = s.item_id ?? `label:${s.label_serial}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(s);
  }
  return { all, latest };
}

export async function loadItems(supabase: SupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, ItemBrief>();
  const { data } = await supabase.from("items").select(ITEM_BRIEF).in("id", [...new Set(ids)]);
  return new Map(((data ?? []) as ItemBrief[]).map((i) => [i.id, i]));
}
