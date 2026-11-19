// Reading stock, as the signed-in admin (the database's own rules apply).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockStatus } from "@/lib/stock/rules";
import { allRows } from "@/lib/supabase/all-rows";

export type StockLevel = {
  item_id: string;
  name: string;
  label_serial: string;
  location_id: string;
  unit: string;
  minimum_level: number;
  quantity: number | null;
  status: StockStatus;
  usage_since_previous_count: number | null;
  last_counted_at: string | null;
  previous_counted_at: string | null;
};

export type Movement = {
  id: number;
  item_id: string;
  kind: "count" | "restock" | "adjustment";
  quantity: number;
  corrects_id: number | null;
  reason: string | null;
  status: "recorded" | "pending" | "approved" | "rejected";
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_by: string | null;
  created_at: string;
};

export const MOVEMENT_COLUMNS =
  "id, item_id, kind, quantity, corrects_id, reason, status, decided_by, decided_at, decision_note, created_by, created_at";

export async function stockLevelOf(supabase: SupabaseClient, itemId: string): Promise<StockLevel | null> {
  const { data } = await supabase.from("stock_levels").select("*").eq("item_id", itemId).maybeSingle();
  return (data as StockLevel | null) ?? null;
}

/** Display names of the admins (empty id = the seed script). */
export async function adminNames(supabase: SupabaseClient) {
  const data = await allRows<{ id: string; display_name: string }>((from, to) =>
    supabase.from("app_users").select("id, display_name").order("id").range(from, to),
  );
  const names = new Map(data.map((u) => [u.id, u.display_name]));
  return (id: string | null) => (id ? (names.get(id) ?? "Another admin") : "Seed script");
}
