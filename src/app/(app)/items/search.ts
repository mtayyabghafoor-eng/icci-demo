// What the Items search box looks in (P1.18): the item's name and label
// number, and the categories whose names match ("lawnmower" finds every
// item in Lawnmowers). Also the "working" and "open ticket" filters that
// the numbers on What we own open.
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchCategories } from "@/lib/categories/counts";
import { categoryAndInside, type CategoryRow } from "@/lib/categories/rules";

/** Working means Good or Fair (owner's choice, 21 Nov 2026). */
export const WORKING = ["good", "fair"];

/** The database filter for a search: any one of these may match. `q` is already cleaned by cleanSearch. */
export async function searchFilter(_supabase: SupabaseClient, q: string, categories: CategoryRow[]): Promise<string> {
  const parts = [`name.ilike.*${q}*`, `label_serial.ilike.*${q}*`];
  const cats = matchCategories(q, categories).flatMap((c) => categoryAndInside(c.id, categories));
  if (cats.length) parts.push(`category_id.in.(${[...new Set(cats)].join(",")})`);
  return parts.join(",");
}

/** Items with a maintenance ticket not yet closed. */
export async function itemsWithOpenTickets(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from("maintenance_tickets").select("item_id").neq("status", "closed").not("item_id", "is", null).limit(5000);
  const ids = [...new Set(((data ?? []) as { item_id: string }[]).map((t) => t.item_id))];
  // An empty list would match nothing anyway; a made-up id keeps the filter valid.
  return ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
}
