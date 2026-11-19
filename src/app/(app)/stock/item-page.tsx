// The shared frame of the "Count this shelf", "Add stock" and "Correct an
// entry" screens for one consumable (phone-first).
import { titleCase } from "@/lib/ui/text";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STOCK_STATUS } from "@/lib/stock/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups } from "../items/data";
import { StatusBadge } from "../items/ui";
import { stockLevelOf, type StockLevel } from "./data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadConsumable(id: string) {
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const level = await stockLevelOf(supabase, id);
  if (!level) notFound(); // not a consumable, or not visible to this account
  const { locationName } = await loadLookups(supabase);
  return { supabase, level, place: locationName.get(level.location_id) ?? "" };
}

export function StockHeader({ level, place, title }: { level: StockLevel; place: string; title: string }) {
  const s = STOCK_STATUS[level.status];
  return (
    <>
      <p className="text-sm">
        <Link className="back-link" href={`/items/${level.item_id}`}>← Back to the item</Link>
      </p>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">{titleCase(title)}</h1>
      <p className="mt-2 text-lg font-semibold">{level.name}</p>
      <p className="text-sm">
        {level.label_serial} · {place}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <span>
          Now: {level.quantity == null ? "not counted yet" : `${level.quantity} ${level.unit}`} (minimum {level.minimum_level})
        </span>
        <StatusBadge word={s.word} tone={s.tone} />
      </p>
    </>
  );
}
