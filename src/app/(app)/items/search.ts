// What the Items search box looks in: the item's name and label number, the
// categories whose names match ("lawnmower" finds every item in Lawnmowers,
// P1.18), and (P1.19) the maker's serial number, makes and models, and the
// companies that made, supplied or service it. Also the "working", "open
// ticket" and "company" filters other pages link to.
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchCategories } from "@/lib/categories/counts";
import { categoryAndInside, type CategoryRow } from "@/lib/categories/rules";

/** Working means Good or Fair (owner's choice, 21 Nov 2026). */
export const WORKING = ["good", "fair"];

/** The database filter for a search: any one of these may match. `q` is already cleaned by cleanSearch. */
export async function searchFilter(supabase: SupabaseClient, q: string, categories: CategoryRow[]): Promise<string> {
  const parts = [`name.ilike.*${q}*`, `label_serial.ilike.*${q}*`, `maker_serial.ilike.*${q}*`];
  const cats = matchCategories(q, categories).flatMap((c) => categoryAndInside(c.id, categories));
  if (cats.length) parts.push(`category_id.in.(${[...new Set(cats)].join(",")})`);
  const [companies, models] = await Promise.all([
    supabase.from("companies").select("id").ilike("name", `%${q}%`).limit(200),
    supabase.from("product_models").select("id").ilike("model_name", `%${q}%`).limit(200),
  ]);
  const companyIds = ((companies.data ?? []) as { id: string }[]).map((c) => c.id);
  parts.push(...(await companyParts(supabase, companyIds)));
  const modelIds = ((models.data ?? []) as { id: string }[]).map((m) => m.id);
  if (modelIds.length) parts.push(`model_id.in.(${modelIds.join(",")})`);
  return parts.join(",");
}

/** Items a company supplied or services, or whose model it makes or services. */
async function companyParts(supabase: SupabaseClient, companyIds: string[]): Promise<string[]> {
  if (!companyIds.length) return [];
  const list = companyIds.join(",");
  const { data } = await supabase.from("product_models").select("id").or(`maker_company_id.in.(${list}),service_company_id.in.(${list})`).limit(1000);
  const models = ((data ?? []) as { id: string }[]).map((m) => m.id);
  return [`supplier_company_id.in.(${list})`, `service_company_id.in.(${list})`, ...(models.length ? [`model_id.in.(${models.join(",")})`] : [])];
}

/** The "company" filter: everything one company made, supplied or services. */
export async function companyFilter(supabase: SupabaseClient, companyId: string): Promise<string> {
  return (await companyParts(supabase, [companyId])).join(",");
}

/** Items with a maintenance ticket not yet closed. */
export async function itemsWithOpenTickets(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from("maintenance_tickets").select("item_id").neq("status", "closed").not("item_id", "is", null).limit(5000);
  const ids = [...new Set(((data ?? []) as { item_id: string }[]).map((t) => t.item_id))];
  // An empty list would match nothing anyway; a made-up id keeps the filter valid.
  return ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
}
