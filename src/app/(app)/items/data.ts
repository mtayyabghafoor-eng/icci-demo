// Lists every item screen needs: categories and locations (with full paths).
// Reads as the signed-in admin, so the database's own rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryPath, type CategoryRow } from "@/lib/categories/rules";
import { locationPath, type LocationRow } from "@/lib/items/rules";
import { allRows } from "@/lib/supabase/all-rows";

/** A main category (parent_id null) or a sub-category inside one (P1.17). */
export type Category = CategoryRow;

export async function loadLookups(supabase: SupabaseClient) {
  const [cats, locations] = await Promise.all([
    supabase.from("item_categories").select("id, name, parent_id, active, icon").order("name"),
    // Every place, even past the 1,000 rows one request can return.
    allRows<LocationRow>((from, to) =>
      supabase.from("locations").select("id, name, kind, parent_id, active").order("id").range(from, to),
    ),
  ]);
  const categories = (cats.data ?? []) as Category[];
  const locationMap = new Map(locations.map((l) => [l.id, l]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  return {
    categories,
    locations,
    // "Main › Sub", so every screen shows where an item is filed.
    categoryName: new Map(categories.map((c) => [c.id, categoryPath(c.id, categoryMap)])),
    locationName: new Map(locations.map((l) => [l.id, locationPath(l.id, locationMap)])),
  };
}

export const ITEM_COLUMNS =
  "id, label_serial, kind, name, category_id, location_id, condition, value_cents, purchase_date, warranty_end, unit, minimum_level, photo_path, notes, model_id, maker_serial, supplier_company_id, service_company_id, created_at, updated_at";

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
  /** P1.19: make and model, the maker's serial number, who supplied and who services it. */
  model_id: string | null;
  maker_serial: string | null;
  supplier_company_id: string | null;
  service_company_id: string | null;
  created_at: string;
  updated_at: string;
};

export const PHOTO_BUCKET = "item-photos";
