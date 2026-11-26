// The weekly count (phone-first): pick a store room, then enter what is
// found on each shelf. Empty boxes are skipped.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { locationAndInside, locationOptions } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups } from "../../items/data";
import type { StockLevel } from "../data";
import { WeeklyCountForm, type CountRow } from "../forms";
import { BackLink, fieldClass, PageNotice, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Weekly count | ICCI Control Dashboard" };

export default function WeeklyCountPage(props: PageProps<"/stock/count">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <BackLink href="/stock">Low stock</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Weekly Count</h1>
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/stock/count">["searchParams"] }) {
  const params = await searchParams;
  const room = typeof params.room === "string" ? params.room : "";
  const saved = typeof params.saved === "string" ? Number.parseInt(params.saved, 10) : 0;

  const supabase = await createClient();
  const lookups = await loadLookups(supabase);
  const rooms = locationOptions(
    lookups.locations.filter((l) => l.active !== false),
    ["store_room"],
  );
  const chosen = rooms.find((r) => r.id === room);

  let rows: CountRow[] = [];
  if (chosen) {
    const places = locationAndInside(chosen.id, lookups.locations);
    const { data } = await supabase.from("stock_levels").select("*").in("location_id", places);
    const levels = (data ?? []) as StockLevel[];
    const placeName = (id: string) =>
      id === chosen.id ? "Store room" : (lookups.locationName.get(id) ?? "").replace(`${chosen.path} › `, "");
    rows = levels
      .map((l) => ({
        itemId: l.item_id,
        name: l.name,
        label: l.label_serial,
        place: placeName(l.location_id),
        unit: l.unit,
        lastQuantity: l.quantity,
      }))
      .sort((a, b) => a.place.localeCompare(b.place) || a.name.localeCompare(b.name));
  }

  return (
    <>
      {saved > 0 && chosen && (
        <PageNotice>
          Count saved: {saved} shelf {saved === 1 ? "entry" : "entries"} in {chosen.path}.{" "}
          <Link href="/stock">See the low-stock list</Link>
        </PageNotice>
      )}
      <form method="get" className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-icci-line bg-white shadow-card p-5">
        <label className="block min-w-0 flex-1">
          <span className="font-semibold">Store room</span>
          <select name="room" defaultValue={chosen?.id ?? ""} required className={fieldClass}>
            <option value="" disabled>
              Pick a store room
            </option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.path}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900">
          Open
        </button>
      </form>

      {chosen &&
        (rows.length === 0 ? (
          <p className="mt-4">No consumables are kept in this store room yet.</p>
        ) : (
          <>
            <p className="mt-4">
              {rows.length} item{rows.length === 1 ? "" : "s"}. Type what you find on each shelf. Leave a box empty to skip it.
              The count is saved only when you press <strong>Save count</strong>.
            </p>
            <WeeklyCountForm key={`${chosen.id}-${saved}`} roomId={chosen.id} rows={rows} />
          </>
        ))}
    </>
  );
}
