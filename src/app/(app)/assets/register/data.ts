// The asset register's rows: every fixed asset the Centre still has (not
// disposed), with its place and category in words. Read through two narrow
// database look-ups (migration 0049), so Finance can read the register
// (owner, 25 Nov 2026) without being able to read items or places; the
// Library Operator and signed-out visitors get nothing.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegisterRow } from "@/lib/assets/lists";
import { categoryPath, type CategoryRow } from "@/lib/categories/rules";
import { locationPath, type LocationRow } from "@/lib/items/rules";
import { allRows } from "@/lib/supabase/all-rows";
import { pageRows } from "@/lib/supabase/page-rows";

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

type Name = { kind: "place" | "category"; id: string; name: string; parent_id: string | null; place_kind: string | null; active: boolean };

/** The names of places and categories, and the paths built from them ("Main › Sub", "Building › Room"). */
async function loadRegisterNames(supabase: SupabaseClient) {
  const names = await allRows<Name>((from, to) => supabase.rpc("asset_register_names").order("kind").order("id").range(from, to));
  const locations: LocationRow[] = names
    .filter((n) => n.kind === "place")
    .map((n) => ({ id: n.id, name: n.name, kind: n.place_kind ?? "", parent_id: n.parent_id, active: n.active }));
  const categories: CategoryRow[] = names
    .filter((n) => n.kind === "category")
    .map((n) => ({ id: n.id, name: n.name, parent_id: n.parent_id, active: n.active }));
  const locationMap = new Map(locations.map((l) => [l.id, l]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  return {
    locations,
    locationName: new Map(locations.map((l) => [l.id, locationPath(l.id, locationMap)])),
    categoryName: new Map(categories.map((c) => [c.id, categoryPath(c.id, categoryMap)])),
  };
}

export async function loadRegister(supabase: SupabaseClient, placeId: string) {
  const lookups = await loadRegisterNames(supabase);
  const place = lookups.locationName.has(placeId) ? placeId : "";
  // Every row, page by page (one request returns at most 1,000). With a
  // place, the database works out what is inside it.
  const raw = await allRows<Raw>((from, to) =>
    supabase.rpc("asset_register_rows", { p_place: place || null }).order("id").range(from, to),
  );

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

export type PlaceTotal = { place: string; location_id: string; assets: number; total_cents: number; without_value: number };

/**
 * Round C2: what the register page shows, without reading every asset. The
 * totals by place are counted by the database (asset_register_totals,
 * migration 0057); with a place chosen, its assets (and those inside it)
 * come one page at a time, most valuable first.
 */
export async function loadRegisterPage(supabase: SupabaseClient, placeId: string, page: number, size: number) {
  const lookups = await loadRegisterNames(supabase);
  const place = lookups.locationName.has(placeId) ? placeId : "";
  const totalsRes = await supabase.rpc("asset_register_totals", { p_place: place || null });
  if (totalsRes.error) throw new Error(`A list could not be loaded: ${totalsRes.error.message}`);
  const totals: PlaceTotal[] = ((totalsRes.data ?? []) as { location_id: string; assets: number; total_cents: number; without_value: number }[])
    .map((t) => ({ ...t, total_cents: Number(t.total_cents), place: lookups.locationName.get(t.location_id) ?? "Unknown location" }))
    .sort((a, b) => a.place.localeCompare(b.place));

  const shown = place
    ? await pageRows<Raw>(page, size, (from, to) =>
        supabase
          .rpc("asset_register_rows", { p_place: place }, { count: "exact" })
          .order("value_cents", { ascending: false, nullsFirst: false })
          .order("name")
          .order("id")
          .range(from, to),
      )
    : { rows: [] as Raw[], page: 1, pages: 1, total: 0 };
  const rows: RegisterRow[] = shown.rows.map((r) => ({
    id: r.id,
    label_serial: r.label_serial,
    name: r.name,
    category: lookups.categoryName.get(r.category_id) ?? "",
    place: lookups.locationName.get(r.location_id) ?? "Unknown location",
    condition: r.condition,
    value_cents: r.value_cents,
    purchase_date: r.purchase_date,
    warranty_end: r.warranty_end,
  }));
  return { totals, rows, page: shown.page, assetsShown: shown.total, place, placeName: place ? lookups.locationName.get(place)! : "", lookups };
}
