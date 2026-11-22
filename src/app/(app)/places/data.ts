// Reading places for the place screens (slice P1.12). Row-level security
// decides what each account may see: Finance, the Library Operator and
// signed-out visitors get nothing.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaceKind } from "@/lib/places/rules";
import { allRows } from "@/lib/supabase/all-rows";

export type Place = {
  id: string;
  name: string;
  kind: PlaceKind;
  parent_id: string | null;
  active: boolean;
  code: number;
  notes: string | null;
};

export const PLACE_COLUMNS = "id, name, kind, parent_id, active, code, notes";

import { UUID } from "@/lib/forms";

export { UUID };

/**
 * Every place, by name. Read page by page: one request returns at most 1,000
 * rows, and a single request cut the list short once test runs had added
 * many places (found in the P1.12 test run, 20 Nov 2026).
 */
export async function allPlaces(supabase: SupabaseClient): Promise<Place[]> {
  const rows = await allRows<Place>((from, to) => supabase.from("locations").select(PLACE_COLUMNS).order("id").range(from, to));
  return rows.sort((a, b) => a.name.localeCompare(b.name, "en-IE", { numeric: true }));
}

/** The place and the places above it, from the building down. */
export function lineOf(id: string, byId: Map<string, Place>): Place[] {
  const line: Place[] = [];
  let at = byId.get(id);
  let guard = 0;
  while (at && guard++ < 10) {
    line.unshift(at);
    at = at.parent_id ? byId.get(at.parent_id) : undefined;
  }
  return line;
}

/** Places directly inside one place (or the buildings, for null), by name. */
export function childrenOf(parentId: string | null, all: Place[], showOff: boolean): Place[] {
  return all
    .filter((p) => p.parent_id === parentId && (showOff || p.active))
    .sort((a, b) => a.name.localeCompare(b.name, "en-IE", { numeric: true }));
}

/** A place and everything inside it, in tree order (for printing labels). */
export function placeAndInside(id: string, all: Place[]): Place[] {
  const top = all.find((p) => p.id === id);
  if (!top) return [];
  const out: Place[] = [];
  const walk = (p: Place) => {
    out.push(p);
    for (const c of childrenOf(p.id, all, false)) walk(c);
  };
  walk(top);
  return out;
}
