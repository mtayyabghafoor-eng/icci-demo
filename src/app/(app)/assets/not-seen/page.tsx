// "Not seen in 12 months" (PLAN.md 5.1 screens): fixed assets with no
// hands-on event for a year. The database works out "last seen"
// (view asset_last_seen, migration 0016). Designed for a PC first; one card
// per asset on a phone.
import type { Metadata } from "next";
import { FilterFold } from "@/components/ui/filter-fold";
import Link from "next/link";
import { Suspense } from "react";
import { MAY_SEE_ASSET_LISTS, notSeenCutoff, SEEN_HOW_LABEL } from "@/lib/assets/lists";
import { requireAdmin } from "@/lib/auth/current-admin";
import { cleanSearch, formatDate, formatEuro, locationAndInside, locationOptions } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups, type ItemRow } from "../../items/data";
import { ItemStatus } from "../../items/ui";
import { CannotSeeAssets } from "../cannot-see";

export const metadata: Metadata = { title: "Not seen in 12 months | ICCI Control Dashboard" };

const LIMIT = 500;

export default function NotSeenPage(props: PageProps<"/assets/not-seen">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Not Seen in 12 Months</h1>
      <p className="mt-2">
        Fixed assets nobody has had in their hands for a year. An asset counts as seen when it is registered, moved,
        reported damaged, marked repaired or found, or scanned in a stocktake. Opening its page or editing its details
        does not count. Disposed assets are not listed.
      </p>
      <Suspense fallback={<p className="mt-6">Loading assets…</p>}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

type Seen = { item_id: string; last_seen_at: string; last_seen_how: string };
type Row = Pick<ItemRow, "id" | "label_serial" | "kind" | "name" | "location_id" | "condition" | "value_cents">;

async function List({ searchParams }: { searchParams: PageProps<"/assets/not-seen">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ASSET_LISTS.includes(me.roleCode)) return <CannotSeeAssets />;

  const params = await searchParams;
  const q = cleanSearch(one(params.q));
  const location = one(params.location);

  const supabase = await createClient();
  const lookups = await loadLookups(supabase);
  const cutoff = notSeenCutoff(new Date());

  // Oldest first: the ones not seen for longest are the likeliest to be lost.
  let query = supabase
    .from("asset_last_seen")
    .select("item_id, last_seen_at, last_seen_how, label_serial, name, location_id, condition, value_cents")
    .lt("last_seen_at", cutoff.toISOString())
    .order("last_seen_at")
    .limit(LIMIT);
  if (q) query = query.or(`name.ilike.*${q}*,label_serial.ilike.*${q}*`);
  if (lookups.locationName.has(location)) query = query.in("location_id", locationAndInside(location, lookups.locations));
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as (Seen & Omit<Row, "id" | "kind">)[]).map((r) => ({
    ...r,
    items: { ...r, id: r.item_id, kind: "fixed_asset" as const },
  }));

  const filtered = Boolean(q || location);
  const field = "mt-1 block min-h-11 w-full rounded-xl border border-[#87948f] bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green";
  const seenText = (r: Seen) => `${formatDate(r.last_seen_at)} · ${SEEN_HOW_LABEL[r.last_seen_how] ?? r.last_seen_how}`;

  return (
    <>
      <form data-folded="true" method="get" className="list-filters grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Search assets not seen">
        <label className="lg:col-span-2">
          <span className="font-semibold">Search</span>
          <input name="q" defaultValue={q} placeholder="Name or label number" className={field} />
        </label>
        <label className="lg:col-span-2">
          <span className="font-semibold">Location</span>
          <select name="location" defaultValue={location} className={field}>
            <option value="">Everywhere</option>
            {locationOptions(lookups.locations).map((l) => (
              <option key={l.id} value={l.id}>
                {l.path}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900">
            Search
          </button>
          {filtered && (
            <Link href="/assets/not-seen" className="inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green! no-underline hover:bg-icci-green-50">
              Clear filters
            </Link>
          )}
        </div>
        <FilterFold />
      </form>

      <p className="list-count" data-testid="not-seen-count">
        {rows.length === 0
          ? filtered
            ? "Nothing here has gone unseen for 12 months."
            : "Every asset has been seen in the last 12 months."
          : `${rows.length}${rows.length === LIMIT ? "+" : ""} asset${rows.length === 1 ? " has" : "s have"} not been seen since ${formatDate(cutoff.toISOString())}. Oldest first.`}
      </p>

      {rows.length > 0 && (
        <>
          <div className="list-table-wrap">
          <table className="list-table hidden md:table">
            <thead>
              <tr>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item_id} className="border-b border-icci-panel align-top">
                  <td className="px-3 py-2 font-mono text-sm whitespace-nowrap">{r.items.label_serial}</td>
                  <td className="px-3 py-2">
                    <Link href={`/items/${r.item_id}`} className="font-semibold">
                      {r.items.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-sm">{lookups.locationName.get(r.items.location_id)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatEuro(r.items.value_cents)}</td>
                  <td className="px-3 py-2 text-sm">{seenText(r)}</td>
                  <td className="px-3 py-2">
                    <ItemStatus kind={r.items.kind} condition={r.items.condition} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <ul className="mt-3 space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.item_id}>
                <Link href={`/items/${r.item_id}`} className="list-card">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-icci-green">{r.items.name}</span>
                    <ItemStatus kind={r.items.kind} condition={r.items.condition} />
                  </span>
                  <span className="mt-1 block text-sm">
                    {r.items.label_serial} · {formatEuro(r.items.value_cents)}
                  </span>
                  <span className="block text-sm">{lookups.locationName.get(r.items.location_id)}</span>
                  <span className="block text-sm">Last seen {seenText(r)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
