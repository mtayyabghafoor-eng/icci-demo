// The weekly count (phone-first): pick a store room, then enter what is
// found on each shelf. Empty boxes are skipped.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { locationAndInside, locationOptions } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-admin";
import { loadLookups } from "../../items/data";
import type { StockLevel } from "../data";
import { WeeklyCountForm, type CountRow } from "../forms";
import { BackLink, fieldClass, PageNotice, Skeleton, StatusBadge } from "@/components/ui";
import { ChevronRight } from "lucide-react";

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

  // D4: without a room chosen, every store room is listed with when it was
  // last counted, so the room that is due stands out.
  if (!chosen) {
    const { data: all } = await supabase.from("stock_levels").select("location_id, last_counted_at");
    const levels = (all ?? []) as Pick<StockLevel, "location_id" | "last_counted_at">[];
    const now = (await requireAdmin()).serverNow;
    const cards = rooms.map((r) => {
      const inside = new Set(locationAndInside(r.id, lookups.locations));
      const mine = levels.filter((l) => inside.has(l.location_id));
      const counted = mine.map((l) => l.last_counted_at).filter((t): t is string => !!t).sort();
      const last = counted.at(-1) ?? null;
      const days = last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : null;
      return { ...r, items: mine.length, days };
    });
    return (
      <>
        <p className="mt-2 text-icci-ink-60">Pick the store room you are standing in. Rooms not counted for over a week come first.</p>
        <ul className="mt-4 space-y-2" data-testid="count-rooms">
          {cards
            .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999) || a.path.localeCompare(b.path))
            .map((r) => {
              const due = r.items > 0 && (r.days === null || r.days > 7);
              return (
                <li key={r.id}>
                  <Link
                    href={`/stock/count?room=${r.id}`}
                    className="group flex min-h-16 items-center gap-3 rounded-2xl border border-icci-line bg-white p-4 text-icci-text! no-underline shadow-card transition-colors duration-150 hover:border-icci-gold-300 hover:bg-icci-green-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-icci-green-dark">{r.path.split(" › ").at(-1)}</span>
                      <span className="block text-sm text-icci-ink-60">{r.path.split(" › ").slice(0, -1).join(" › ")}</span>
                      <span className="mt-1 block text-sm">
                        {r.items === 0 ? "Nothing kept here yet" : `${r.items} ${r.items === 1 ? "item" : "items"}`}
                      </span>
                    </span>
                    {r.items > 0 && (
                      <StatusBadge
                        tone={due ? "amber" : "green"}
                        word={r.days === null ? "Never counted" : r.days === 0 ? "Counted today" : r.days === 1 ? "Counted yesterday" : `Counted ${r.days} days ago`}
                      />
                    )}
                    <ChevronRight aria-hidden size={18} className="shrink-0 text-icci-ink-60" />
                  </Link>
                </li>
              );
            })}
        </ul>
      </>
    );
  }

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
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-icci-green-dark">{chosen.path}</span>
        <Link href="/stock/count" className="inline-flex min-h-11 items-center text-sm font-semibold">
          Another store room
        </Link>
      </p>
      <form method="get" hidden className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-icci-line bg-white shadow-card p-5">
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
