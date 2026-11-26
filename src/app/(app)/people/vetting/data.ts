// The vetting list's rows: switched-on people, worked out by the database
// (view people_vetting) and put worst first. Reads as the signed-in admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/supabase/all-rows";
import { pageRows, type Page } from "@/lib/supabase/page-rows";
import { VETTING_ROW_COLUMNS, VETTING_STATUS, worstFirst, type VettingRow, type VettingStatus } from "@/lib/vetting/rules";

/** A5: "attention" is what Home counts: expired, not vetted, or due within 60 days. */
export const VETTING_ATTENTION: VettingStatus[] = ["expired", "none", "due"];
export type VettingFilter = { status: VettingStatus | "attention" | ""; section: string; showNotRequired: boolean };

export function readVettingFilter(params: Record<string, string | string[] | undefined>, sectionIds: Set<string>): VettingFilter {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const status = one(params.status);
  const section = one(params.section);
  return {
    status: status === "attention" ? "attention" : status in VETTING_STATUS ? (status as VettingStatus) : "",
    section: sectionIds.has(section) ? section : "",
    showNotRequired: one(params.all) === "yes",
  };
}

export async function loadVettingList(supabase: SupabaseClient, f: VettingFilter): Promise<VettingRow[]> {
  const rows = await allRows<VettingRow>((from, to) => {
    let q = supabase.from("people_vetting").select(VETTING_ROW_COLUMNS).eq("active", true).order("person_id").range(from, to);
    if (f.status === "attention") q = q.in("status", VETTING_ATTENTION);
    else if (f.status) q = q.eq("status", f.status);
    else if (!f.showNotRequired) q = q.neq("status", "not_required");
    if (f.section) q = q.eq("section_id", f.section);
    return q;
  });
  return worstFirst(rows);
}

/**
 * Round C2: one page of the list, worst first, straight from the database
 * (view people_vetting_list, migration 0057, sorts the way worstFirst does).
 */
export async function loadVettingPage(supabase: SupabaseClient, f: VettingFilter, page: number, size: number): Promise<Page<VettingRow>> {
  return pageRows<VettingRow>(page, size, (from, to) => {
    let q = supabase
      .from("people_vetting_list")
      .select(VETTING_ROW_COLUMNS, { count: "exact" })
      .eq("active", true)
      .order("list_rank")
      .order("expires_on", { nullsFirst: false })
      .order("full_name")
      .order("person_id")
      .range(from, to);
    if (f.status === "attention") q = q.in("status", VETTING_ATTENTION);
    else if (f.status) q = q.eq("status", f.status);
    else if (!f.showNotRequired) q = q.neq("status", "not_required");
    if (f.section) q = q.eq("section_id", f.section);
    return q;
  });
}
