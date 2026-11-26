// What the renewals screens read. Reads as the signed-in admin, so the
// database's own rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/supabase/all-rows";
import { pageRows, type Page } from "@/lib/supabase/page-rows";
import { addDays, todayInDublin } from "@/lib/vetting/rules";
import { REGISTER_COLUMNS, SOON_DAYS, SOURCE_GROUPS, statusesFor, worstFirst, type RegisterFilter, type RegisterRow } from "@/lib/renewals/rules";

export { keeperChoices as ownerChoices } from "../vehicles/data";

/** The register's rows for this filter, worst first. */
export async function loadRegister(supabase: SupabaseClient, f: RegisterFilter): Promise<RegisterRow[]> {
  const sources = f.from ? SOURCE_GROUPS.find((g) => g.id === f.from)!.sources : null;
  const rows = await allRows<RegisterRow>((from, to) => {
    let q = supabase
      .from("renewals_register")
      .select(REGISTER_COLUMNS)
      .in("status", statusesFor(f.show))
      .order("source")
      .order("record_id")
      .order("title")
      .range(from, to);
    if (sources) q = q.in("source", sources);
    // A5: Home's "due in 30 days" (an overdue date is always before then).
    if (f.show === "soon") q = q.lte("due_on", addDays(todayInDublin(), SOON_DAYS));
    return q;
  });
  return worstFirst(rows);
}

/**
 * Round C2: one page of the register, worst first, straight from the
 * database (view renewals_register_list, migration 0057, sorts the way
 * worstFirst does).
 */
export async function loadRegisterPage(supabase: SupabaseClient, f: RegisterFilter, page: number, size: number): Promise<Page<RegisterRow>> {
  const sources = f.from ? SOURCE_GROUPS.find((g) => g.id === f.from)!.sources : null;
  return pageRows<RegisterRow>(page, size, (from, to) => {
    let q = supabase
      .from("renewals_register_list")
      .select(REGISTER_COLUMNS, { count: "exact" })
      .in("status", statusesFor(f.show))
      .order("list_rank")
      .order("due_on", { nullsFirst: false })
      .order("title")
      .order("source")
      .order("record_id")
      .range(from, to);
    if (sources) q = q.in("source", sources);
    if (f.show === "soon") q = q.lte("due_on", addDays(todayInDublin(), SOON_DAYS));
    return q;
  });
}

/** Names of the owners in these rows, by person id. */
export async function ownerNames(supabase: SupabaseClient, rows: Pick<RegisterRow, "owner_person_id">[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.flatMap((r) => (r.owner_person_id ? [r.owner_person_id] : [])))];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase.from("people").select("id, full_name").in("id", ids.slice(i, i + 150));
    for (const p of (data ?? []) as { id: string; full_name: string }[]) names.set(p.id, p.full_name);
  }
  return names;
}
