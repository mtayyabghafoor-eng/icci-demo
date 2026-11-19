// Lists every item screen needs: categories and locations (with full paths).
// Reads as the signed-in admin, so the database's own rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { locationPath, type LocationRow } from "@/lib/items/rules";
import { allRows } from "@/lib/supabase/all-rows";

export type Category = { id: string; name: string; active: boolean };

export async function loadLookups(supabase: SupabaseClient) {
  const [cats, locations] = await Promise.all([
    supabase.from("item_categories").select("id, name, active").order("name"),
    // Every place, even past the 1,000 rows one request can return.
    allRows<LocationRow>((from, to) =>
      supabase.from("locations").select("id, name, kind, parent_id, active").order("id").range(from, to),
    ),
  ]);
  const categories = (cats.data ?? []) as Category[];
  const locationMap = new Map(locations.map((l) => [l.id, l]));
  return {
    categories,
    locations,
    categoryName: new Map(categories.map((c) => [c.id, c.name])),
    locationName: new Map(locations.map((l) => [l.id, locationPath(l.id, locationMap)])),
  };
}

export const ITEM_COLUMNS =
  "id, label_serial, kind, name, category_id, location_id, condition, value_cents, purchase_date, warranty_end, unit, minimum_level, photo_path, notes, created_at, updated_at";

export type ItemRow = {
  id: string;
  label_serial: string;
  kind: "fixed_asset" | "consumable";
  name: string;
  category_id: string;
  location_id: string;
  condition: "good" | "fair" | "damaged" | "missing" | "disposed" | null;
  value_cents: number | null;
  purchase_date: string | null;
  warranty_end: string | null;
  unit: string | null;
  minimum_level: number | null;
  photo_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const PHOTO_BUCKET = "item-photos";
