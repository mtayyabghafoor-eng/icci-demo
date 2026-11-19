// The asset register's rows: every fixed asset the Centre still has (not
// disposed), with its place and category in words. Reads as the signed-in
// admin, so the database's own rules apply (Finance gets nothing).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegisterRow } from "@/lib/assets/lists";
import { locationAndInside } from "@/lib/items/rules";
import { allRows } from "@/lib/supabase/all-rows";
import { loadLookups } from "../../items/data";

type Raw = {
  id: string;
  label_serial: string;
  name: string;
  category_id: string;
  location_id: string;
  condition: string;
  value_cents: number | null;
  purchase_date: string | null;
  warranty_end: string | null;
};

export async function loadRegister(supabase: SupabaseClient, placeId: string) {
  const lookups = await loadLookups(supabase);
  const place = lookups.locationName.has(placeId) ? placeId : "";
  const inside = place ? locationAndInside(place, lookups.locations) : null;

  // Every row, page by page (one request returns at most 1,000).
  const raw = await allRows<Raw>((from, to) => {
    let q = supabase
      .from("items")
      .select("id, label_serial, name, category_id, location_id, condition, value_cents, purchase_date, warranty_end")
      .eq("kind", "fixed_asset")
      .neq("condition", "disposed")
      .order("id")
      .range(from, to);
    if (inside) q = q.in("location_id", inside);
    return q;
  });

  const placeIdOf = new Map<string, string>();
  const rows: RegisterRow[] = raw.map((r) => {
    const path = lookups.locationName.get(r.location_id) ?? "Unknown location";
    placeIdOf.set(path, r.location_id);
    return {
      id: r.id,
      label_serial: r.label_serial,
      name: r.name,
      category: lookups.categoryName.get(r.category_id) ?? "",
      place: path,
      condition: r.condition,
      value_cents: r.value_cents,
      purchase_date: r.purchase_date,
      warranty_end: r.warranty_end,
    };
  });
  return { rows, place, placeName: place ? lookups.locationName.get(place)! : "", placeIdOf, lookups };
}
