// Loads one rota week for the screens: the week, its slots as they are now
// (view rota_entries, with prayer times filled in), the warnings worked out
// by the database (view rota_warnings), and the names to show. Reads as the
// signed-in admin, so the database's access rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/supabase/all-rows";
import { SLOT_TYPE_COLUMNS, type SlotGroup, type SlotType, type TimeKey } from "@/lib/rota/rules";
import { WARNING_COLUMNS, type RotaWarning } from "@/lib/rota/week";

export type RotaWeek = { id: string; week_start: string; status: string };

export type RotaEntry = {
  id: number;
  week_id: string;
  assignment_date: string;
  slot_type_id: string;
  slot_group: SlotGroup;
  prayer_time: TimeKey | null;
  location_id: string | null;
  person_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  start_min: number | null;
  note: string | null;
};
export const ENTRY_COLUMNS =
  "id, week_id, assignment_date, slot_type_id, slot_group, prayer_time, location_id, person_id, starts_at, ends_at, start_min, note";

export type Place = { id: string; label: string };

/** Switched-on buildings and rooms, as "Room (Building)". */
export async function loadPlaces(supabase: SupabaseClient, alsoIds: string[] = []): Promise<Place[]> {
  // Round C2: every one, page by page (one request returns at most 1,000).
  const all = await allRows<{ id: string; name: string; kind: string; parent_id: string | null; active: boolean }>((from, to) =>
    supabase.from("locations").select("id, name, kind, parent_id, active").in("kind", ["building", "room"]).order("name").order("id").range(from, to),
  );
  const byId = new Map(all.map((l) => [l.id, l]));
  return all
    .filter((l) => l.active || alsoIds.includes(l.id))
    .map((l) => {
      const parent = l.parent_id ? byId.get(l.parent_id) : undefined;
      return { id: l.id, label: parent ? `${l.name} (${parent.name})` : l.name };
    });
}

export async function loadSlotTypes(supabase: SupabaseClient): Promise<SlotType[]> {
  const { data } = await supabase.from("rota_slot_types").select(SLOT_TYPE_COLUMNS).order("display_order");
  return (data ?? []) as SlotType[];
}

export async function peopleNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data } = await supabase.from("people").select("id, full_name").in("id", unique);
  return new Map(((data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
}

export async function loadWeek(supabase: SupabaseClient, monday: string) {
  const { data: week } = await supabase.from("rota_weeks").select("id, week_start, status").eq("week_start", monday).maybeSingle();
  if (!week) return null;
  const [entries, warnings] = await Promise.all([
    supabase.from("rota_entries").select(ENTRY_COLUMNS).eq("week_id", week.id).order("assignment_date").order("start_min", { nullsFirst: false }).order("id"),
    supabase.from("rota_warnings").select(WARNING_COLUMNS).eq("week_id", week.id),
  ]);
  return {
    week: week as RotaWeek,
    entries: (entries.data ?? []) as RotaEntry[],
    warnings: (warnings.data ?? []) as RotaWarning[],
  };
}

export type PublishState = {
  /** The latest publication, if the week was ever published. */
  latest: { id: number; published_at: string; published_by: string } | null;
  count: number;
  /** Slots as they are now that were added, swapped or emptied since the latest publication. */
  changed: Set<number>;
  /** Slots in the latest publication that are no longer on the week. */
  removed: number;
};

/** Slice P3.3: how the week stands against its latest publication. */
export async function loadPublishState(supabase: SupabaseClient, weekId: string): Promise<PublishState> {
  const [pubs, changes] = await Promise.all([
    supabase
      .from("rota_publications")
      .select("id, published_at, published_by", { count: "exact" })
      .eq("week_id", weekId)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
    supabase.from("rota_changes").select("kind, assignment_id").eq("week_id", weekId),
  ]);
  const rows = (changes.data ?? []) as { kind: string; assignment_id: number }[];
  return {
    latest: (pubs.data?.[0] as PublishState["latest"]) ?? null,
    count: pubs.count ?? 0,
    changed: new Set(rows.filter((r) => r.kind === "changed").map((r) => r.assignment_id)),
    removed: rows.filter((r) => r.kind === "removed").length,
  };
}
