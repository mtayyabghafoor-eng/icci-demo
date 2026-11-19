// What the policy screens read. Reads as the signed-in admin, so the
// database's own rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Choice } from "./forms";

/** Switched-on people, by name, for the "Owner" picker (plus the current owner, even if switched off). */
export async function ownerChoices(supabase: SupabaseClient, currentOwner?: string): Promise<Choice[]> {
  // Only switched-on people are asked for (the directory also holds many
  // switched-off people), plus the current one if they are switched off.
  const [{ data }, { data: extra }] = await Promise.all([
    supabase.from("people").select("id, full_name, active").eq("active", true).order("full_name").limit(5000),
    currentOwner ? supabase.from("people").select("id, full_name, active").eq("id", currentOwner).eq("active", false) : Promise.resolve({ data: [] }),
  ]);
  return [...((data ?? []) as { id: string; full_name: string; active: boolean }[]), ...((extra ?? []) as { id: string; full_name: string; active: boolean }[])].map(
    (p) => ({ id: p.id, name: p.active ? p.full_name : `${p.full_name} (switched off)` }),
  );
}

/** Switched-on person roles, by name, for "Who must sign it". */
export async function roleChoices(supabase: SupabaseClient): Promise<Choice[]> {
  const { data } = await supabase.from("person_roles").select("id, name, active").order("name");
  return ((data ?? []) as { id: string; name: string; active: boolean }[]).filter((r) => r.active).map((r) => ({ id: r.id, name: r.name }));
}
