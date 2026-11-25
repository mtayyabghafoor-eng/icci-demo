// The missing and damaged list (PLAN.md 5.1 screens), with search and filters.
// Designed for a PC first; one card per asset on a phone.
import { PackageCheck } from "lucide-react";
import type { Metadata } from "next";
import { Pagination, EmptyState, LinkButton } from "@/components/ui";
import { FilterFold } from "@/components/ui/filter-fold";
import Link from "next/link";
import { Suspense } from "react";
import { ASSET_EVENT_COLUMNS, reporterOf, type AssetEventRow } from "@/lib/assets/rules";
import { cleanSearch, formatDate, formatEuro, locationAndInside, locationOptions } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/supabase/must";
import { lastPage, PAGE_SIZE, readPage } from "@/lib/ui/text";
import { loadLookups, type ItemRow } from "../items/data";
import { ItemStatus } from "../items/ui";
import { reporterNames } from "../people/reporter";

export const metadata: Metadata = { title: "Missing and damaged | ICCI Control Dashboard" };

export default function AssetsPage(props: PageProps<"/assets">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Missing and Damaged</h1>
      <p className="mt-2">Fixed assets reported damaged or missing. Open one to mark it repaired or found, move it, or dispose of it.</p>
      <Suspense fallback={<p className="mt-6">Loading assets…</p>}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

type Row = Pick<ItemRow, "id" | "label_serial" | "kind" | "name" | "location_id" | "condition" | "value_cents">;

async function List({ searchParams }: { searchParams: PageProps<"/assets">["searchParams"] }) {
  const params = await searchParams;
  const q = cleanSearch(one(params.q));
  const location = one(params.location);
  const show = one(params.show);

  const supabase = await createClient();
  const lookups = await loadLookups(supabase);

  // The same search, either for one page of rows or only for how many there are.
  const search = (columns: string, options: { count: "exact"; head?: boolean }) => {
    let query = supabase
      .from("items")
      .select(columns, options)
      .eq("kind", "fixed_asset")
      .in("condition", show === "damaged" || show === "missing" ? [show] : ["damaged", "missing"]);
    if (q) query = query.or(`name.ilike.*${q}*,label_serial.ilike.*${q}*`);
    if (lookups.locationName.has(location)) query = query.in("location_id", locationAndInside(location, lookups.locations));
    return query;
  };
  // How many match in all, and how many of those are damaged, so the counts
  // cover every page; then one page of 50 rows.
  const [all, damagedCount, pending] = await Promise.all([
    search("id", { count: "exact", head: true }),
    search("id", { count: "exact", head: true }).eq("condition", "damaged"),
    supabase.from("asset_events").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const total = must(all).count ?? 0;
  const page = lastPage(readPage(params.page), total, PAGE_SIZE);
  const { data } = total
    ? must(await search("id, label_serial, kind, name, location_id, condition, value_cents", { count: "exact" })
        .order("condition")
        .order("name")
        .order("id")
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1))
    : { data: [] };
  const rows = (data ?? []) as unknown as Row[];
  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, location, show })) if (v) p.set(k, v);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/assets?${s}` : "/assets";
  };

  // The latest damage or missing report for each, to show when and who.
  const ids = rows.map((r) => r.id);
  const { data: evs } = ids.length
    ? await supabase
        .from("asset_events")
        .select(ASSET_EVENT_COLUMNS)
        .in("item_id", ids)
        .in("kind", ["damage", "missing"])
        .order("id", { ascending: false })
    : { data: [] };
  const latest = new Map<string, AssetEventRow>();
  for (const e of (evs ?? []) as AssetEventRow[]) if (!latest.has(e.item_id)) latest.set(e.item_id, e);

  const reporters = await reporterNames(supabase, [...latest.values()]);
  const damaged = damagedCount.count ?? 0;
  const missing = total - damaged;
  const filtered = Boolean(q || location || show);
  const field = "mt-1 block min-h-11 w-full rounded-xl border border-[#87948f] bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green";
  const since = (r: Row) => {
    const e = latest.get(r.id);
    return e ? `${formatDate(e.created_at)} · reported by ${reporterOf(e, reporters).name}` : "No report recorded";
  };

  return (
    <>
      {(pending.count ?? 0) > 0 && (
        <p className="mt-4 rounded-xl border border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)] px-4 py-3">
          {pending.count} disposal{pending.count === 1 ? " is" : "s are"} waiting for approval.{" "}
          <Link href="/assets/approvals" className="font-semibold">
            See disposals waiting
          </Link>
        </p>
      )}

      <form data-folded="true" method="get" className="list-filters grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Search missing and damaged">
        <label className="lg:col-span-2">
          <span className="font-semibold">Search</span>
          <input name="q" defaultValue={q} placeholder="Name or label number" className={field} />
        </label>
        <label>
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
        <label>
          <span className="font-semibold">Show</span>
          <select name="show" defaultValue={show} className={field}>
            <option value="">Damaged and missing</option>
            <option value="damaged">Damaged only</option>
            <option value="missing">Missing only</option>
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900">
            Search
          </button>
          {filtered && (
            <Link href="/assets" className="inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green! no-underline hover:bg-icci-green-50">
              Clear filters
            </Link>
          )}
        </div>
        <FilterFold />
      </form>

      <p className="list-count" data-testid="asset-count">
        {total === 0 ? "Nothing is damaged or missing here." : `${damaged} damaged · ${missing} missing`}
      </p>

      {/* A6: an empty list says so in one calm card, with a way out of the filters. */}
      {total === 0 && (
        <div className="mt-4" data-testid="empty-list">
          <EmptyState
            icon={PackageCheck}
            title="Nothing damaged or missing here"
            action={filtered ? <LinkButton href="/assets" kind="outline">Clear filters</LinkButton> : undefined}
          >
            {filtered ? "Nothing matches these filters." : "When an asset is reported damaged or missing, it appears in this list."}
          </EmptyState>
        </div>
      )}
      <div className={total === 0 ? "hidden" : "list-table-wrap"}>
      <table className="list-table hidden md:table">
        <thead>
          <tr>
            <th className="px-3 py-2">Label</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2">Reported</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-icci-panel align-top">
              <td className="px-3 py-2 font-mono text-sm whitespace-nowrap">{r.label_serial}</td>
              <td className="px-3 py-2">
                <Link href={`/items/${r.id}`} className="font-semibold">
                  {r.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-sm">{lookups.locationName.get(r.location_id)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatEuro(r.value_cents)}</td>
              <td className="px-3 py-2 text-sm">{since(r)}</td>
              <td className="px-3 py-2">
                <ItemStatus kind={r.kind} condition={r.condition} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/items/${r.id}`} className="list-card">
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-icci-green">{r.name}</span>
                <ItemStatus kind={r.kind} condition={r.condition} />
              </span>
              <span className="mt-1 block text-sm">
                {r.label_serial} · {formatEuro(r.value_cents)}
              </span>
              <span className="block text-sm">{lookups.locationName.get(r.location_id)}</span>
              <span className="block text-sm">{since(r)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {total > PAGE_SIZE && <Pagination page={page} size={PAGE_SIZE} total={total} hrefFor={pageLink} />}
    </>
  );
}
