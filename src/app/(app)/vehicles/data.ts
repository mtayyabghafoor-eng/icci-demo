// What the vehicle screens read. Reads as the signed-in admin, so the
// database's own rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Choice } from "./forms";

/** Switched-on people, by name, for the "Keeper" picker (plus the current keeper, even if switched off). */
export async function keeperChoices(supabase: SupabaseClient, current?: string | null): Promise<Choice[]> {
  // Only switched-on people are asked for (the directory also holds many
  // switched-off people), plus the current one if they are switched off.
  const [{ data }, { data: extra }] = await Promise.all([
    supabase.from("people").select("id, full_name, active").eq("active", true).order("full_name").limit(5000),
    current ? supabase.from("people").select("id, full_name, active").eq("id", current).eq("active", false) : Promise.resolve({ data: [] }),
  ]);
  return [...((data ?? []) as { id: string; full_name: string; active: boolean }[]), ...((extra ?? []) as { id: string; full_name: string; active: boolean }[])].map(
    (p) => ({ id: p.id, name: p.active ? p.full_name : `${p.full_name} (switched off)` }),
  );
}

/** Assets in the "Vehicles" category, not disposed of, with no vehicle details yet. */
export async function assetChoices(supabase: SupabaseClient): Promise<Choice[]> {
  const { data: cat } = await supabase.from("item_categories").select("id").eq("name", "Vehicles").maybeSingle();
  if (!cat) return [];
  const [{ data: items }, { data: taken }] = await Promise.all([
    supabase.from("items").select("id, name, label_serial, condition").eq("category_id", cat.id).eq("kind", "fixed_asset").neq("condition", "disposed").order("name"),
    supabase.from("vehicles").select("item_id"),
  ]);
  const used = new Set(((taken ?? []) as { item_id: string }[]).map((t) => t.item_id));
  return ((items ?? []) as { id: string; name: string; label_serial: string }[])
    .filter((i) => !used.has(i.id))
    .map((i) => ({ id: i.id, name: `${i.name} (${i.label_serial})` }));
}
