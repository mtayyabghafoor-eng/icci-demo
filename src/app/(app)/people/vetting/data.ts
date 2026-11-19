// The vetting list's rows: switched-on people, worked out by the database
// (view people_vetting) and put worst first. Reads as the signed-in admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/supabase/all-rows";
import { VETTING_ROW_COLUMNS, VETTING_STATUS, worstFirst, type VettingRow, type VettingStatus } from "@/lib/vetting/rules";

export type VettingFilter = { status: VettingStatus | ""; section: string; showNotRequired: boolean };

export function readVettingFilter(params: Record<string, string | string[] | undefined>, sectionIds: Set<string>): VettingFilter {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const status = one(params.status);
  const section = one(params.section);
  return {
    status: status in VETTING_STATUS ? (status as VettingStatus) : "",
    section: sectionIds.has(section) ? section : "",
    showNotRequired: one(params.all) === "yes",
  };
}

export async function loadVettingList(supabase: SupabaseClient, f: VettingFilter): Promise<VettingRow[]> {
  const rows = await allRows<VettingRow>((from, to) => {
    let q = supabase.from("people_vetting").select(VETTING_ROW_COLUMNS).eq("active", true).order("person_id").range(from, to);
    if (f.status) q = q.eq("status", f.status);
    else if (!f.showNotRequired) q = q.neq("status", "not_required");
    if (f.section) q = q.eq("section_id", f.section);
    return q;
  });
  return worstFirst(rows);
}
