// What the register screens read (Phase 6). Reads as the signed-in Super
// Admin, so the database's own rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/supabase/all-rows";

export type PersonChoice = { id: string; name: string; role: string; imam: boolean; on: boolean };

/**
 * Switched-on people for the imam, officiant and on-duty pickers, imams
 * first, then everyone else by name. People the entry already names are
 * added even if switched off since (a correction may keep them).
 */
export async function personChoices(supabase: SupabaseClient, keep: string[] = []): Promise<PersonChoice[]> {
  type P = { id: string; full_name: string; active: boolean; person_roles: { name: string } | null };
  const [on, kept] = await Promise.all([
    allRows<P>((from, to) =>
      supabase.from("people").select("id, full_name, active, person_roles(name)").eq("active", true).order("full_name").order("id").range(from, to),
    ),
    keep.length ? supabase.from("people").select("id, full_name, active, person_roles(name)").in("id", keep).eq("active", false) : Promise.resolve({ data: [] }),
  ]);
  const all = [...on, ...(((kept as { data: unknown }).data ?? []) as P[])];
  return all
    .map((p) => {
      const role = p.person_roles?.name ?? "";
      return { id: p.id, name: p.active ? p.full_name : `${p.full_name} (switched off)`, role, imam: role === "Imam", on: p.active };
    })
    .sort((a, b) => Number(b.imam) - Number(a.imam) || Number(b.on) - Number(a.on) || a.name.localeCompare(b.name));
}

/** Names of people, by id (switched off ones too). */
export async function peopleNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, { name: string; on: boolean }>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("people").select("id, full_name, active").in("id", unique);
  return new Map(((data ?? []) as { id: string; full_name: string; active: boolean }[]).map((p) => [p.id, { name: p.full_name, on: p.active }]));
}

/** Who the rota has on "Funeral on call" that day (draft or published weeks). */
export async function onCallOn(supabase: SupabaseClient, day: string): Promise<string[]> {
  const { data: types } = await supabase.from("rota_slot_types").select("id").eq("name", "Funeral on call");
  const ids = ((types ?? []) as { id: string }[]).map((t) => t.id);
  if (ids.length === 0) return [];
  const { data } = await supabase.from("rota_entries").select("person_id").eq("assignment_date", day).in("slot_type_id", ids).not("person_id", "is", null);
  return [...new Set(((data ?? []) as { person_id: string }[]).map((r) => r.person_id))];
}

/** Display names of the admin accounts, for "Recorded by". */
export async function adminNames(supabase: SupabaseClient): Promise<(id: string | null) => string> {
  const { data } = await supabase.from("app_users").select("id, display_name");
  const names = new Map(((data ?? []) as { id: string; display_name: string }[]).map((a) => [a.id, a.display_name]));
  return (id) => (id && names.get(id)) || "an admin";
}
