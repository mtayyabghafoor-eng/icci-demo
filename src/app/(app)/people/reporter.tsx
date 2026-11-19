// "Reported by" on asset entries (P2.2): a person from the directory (a link
// to their page) or a typed name (plain text, as it was typed).
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { reporterOf, type AssetEventRow } from "@/lib/assets/rules";

/** The names of the people these entries name, switched-off ones included. */
export async function reporterNames(
  supabase: SupabaseClient,
  events: Pick<AssetEventRow, "reported_by_person_id">[],
): Promise<Map<string, string>> {
  const ids = [...new Set(events.map((e) => e.reported_by_person_id).filter((x): x is string => Boolean(x)))];
  if (!ids.length) return new Map();
  const { data } = await supabase.from("people").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
}

export function Reporter({ event, names }: { event: Pick<AssetEventRow, "reported_by" | "reported_by_person_id">; names: Map<string, string> }) {
  const r = reporterOf(event, names);
  return r.personId ? (
    <Link href={`/people/${r.personId}`} dir="auto">
      {r.name}
    </Link>
  ) : (
    <span dir="auto">{r.name}</span>
  );
}
