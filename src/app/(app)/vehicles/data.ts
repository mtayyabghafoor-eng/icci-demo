// What the vehicle screens read. Reads as the signed-in admin, so the
// database's own rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/supabase/all-rows";
import type { Choice } from "./forms";

/** Switched-on people, by name, for the "Keeper" picker (plus the current keeper, even if switched off). */
export async function keeperChoices(supabase: SupabaseClient, current?: string | null): Promise<Choice[]> {
  // Only switched-on people are asked for (the directory also holds many
  // switched-off people), plus the current one if they are switched off.
  const [{ data }, { data: extra }] = await Promise.all([
    // Round C2: every one, page by page (one request returns at most 1,000).
    allRows<{ id: string; full_name: string; active: boolean }>((from, to) =>
      supabase.from("people").select("id, full_name, active").eq("active", true).order("full_name").order("id").range(from, to),
    ).then((rows) => ({ data: rows })),
    current ? supabase.from("people").select("id, full_name, active").eq("id", current).eq("active", false) : Promise.resolve({ data: [] }),
  ]);
  return [...((data ?? []) as { id: string; full_name: string; active: boolean }[]), ...((extra ?? []) as { id: string; full_name: string; active: boolean }[])].map(
    (p) => ({ id: p.id, name: p.active ? p.full_name : `${p.full_name} (switched off)` }),
  );
}

/**
 * Assets in any sub-category of the "Vehicles" main category (Cars and vans,
 * Minibuses and buses, ...; P1.17), not disposed of, with no vehicle
 * details yet.
 */
export async function assetChoices(supabase: SupabaseClient): Promise<Choice[]> {
  const { data: main } = await supabase.from("item_categories").select("id").eq("name", "Vehicles").is("parent_id", null).maybeSingle();
  if (!main) return [];
  const { data: subs } = await supabase.from("item_categories").select("id").eq("parent_id", main.id);
  const inside = ((subs ?? []) as { id: string }[]).map((c) => c.id);
  if (inside.length === 0) return [];
  const [{ data: items }, { data: taken }] = await Promise.all([
    supabase.from("items").select("id, name, label_serial, condition").in("category_id", inside).eq("kind", "fixed_asset").neq("condition", "disposed").order("name"),
    supabase.from("vehicles").select("item_id"),
  ]);
  const used = new Set(((taken ?? []) as { item_id: string }[]).map((t) => t.item_id));
  return ((items ?? []) as { id: string; name: string; label_serial: string }[])
    .filter((i) => !used.has(i.id))
    .map((i) => ({ id: i.id, name: `${i.name} (${i.label_serial})` }));
}
