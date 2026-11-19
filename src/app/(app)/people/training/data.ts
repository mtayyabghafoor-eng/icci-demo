// The training list's rows: switched-on people's newest course of each type,
// worked out by the database (view people_training) and put worst first.
// Reads as the signed-in admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/supabase/all-rows";
import {
  TRAINING_ROW_COLUMNS,
  TRAINING_STATUS,
  TRAINING_TYPE_COLUMNS,
  worstFirst,
  type TrainingRow,
  type TrainingStatus,
  type TrainingType,
} from "@/lib/training/rules";

export type TrainingFilter = { status: TrainingStatus | ""; type: string; section: string };

export function readTrainingFilter(
  params: Record<string, string | string[] | undefined>,
  typeIds: Set<string>,
  sectionIds: Set<string>,
): TrainingFilter {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const status = one(params.status);
  const type = one(params.type);
  const section = one(params.section);
  return {
    status: status in TRAINING_STATUS ? (status as TrainingStatus) : "",
    type: typeIds.has(type) ? type : "",
    section: sectionIds.has(section) ? section : "",
  };
}

export async function loadTrainingTypes(supabase: SupabaseClient): Promise<TrainingType[]> {
  const { data } = await supabase.from("training_types").select(TRAINING_TYPE_COLUMNS).order("name");
  return (data ?? []) as TrainingType[];
}

export async function loadTrainingList(supabase: SupabaseClient, f: TrainingFilter): Promise<TrainingRow[]> {
  const rows = await allRows<TrainingRow>((from, to) => {
    let q = supabase
      .from("people_training")
      .select(TRAINING_ROW_COLUMNS)
      .eq("active", true)
      .order("person_id")
      .order("training_type_id")
      .range(from, to);
    if (f.status) q = q.eq("status", f.status);
    if (f.type) q = q.eq("training_type_id", f.type);
    if (f.section) q = q.eq("section_id", f.section);
    return q;
  });
  return worstFirst(rows);
}
