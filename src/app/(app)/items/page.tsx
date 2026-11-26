import type { Metadata } from "next";
import { FilterFold } from "@/components/ui/filter-fold";
import Link from "next/link";
import { PackagePlus, PackageSearch } from "lucide-react";
import { Suspense } from "react";
import { EmptyState, ItemStatus, LinkButton, PageHeader, Pagination, Skeleton } from "@/components/ui";
import { matchCategories, NO_COUNT } from "@/lib/categories/counts";
import { categoryAndInside, categoryGroups } from "@/lib/categories/rules";
import { CONDITION_STATUS, CONDITIONS, KIND_LABEL, cleanSearch, locationAndInside, locationOptions } from "@/lib/items/rules";
import type { StockStatus } from "@/lib/stock/rules";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/supabase/must";
import { CategoryOptions } from "../categories/options";
import { categoryCounts } from "../categories/data";
import { CategoryTile, CountLine } from "../categories/tile";
import { companyFilter, itemsWithOpenTickets, searchFilter, WORKING } from "./search";
import { loadLookups, type ItemRow } from "./data";
import { FindLabel } from "./find-label";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Items | ICCI Control Dashboard" };

const PAGE_SIZE = 50;
export default function ItemsPage(props: PageProps<"/items">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Items"
        subtitle="Everything the Centre owns or keeps in stock. Open one to see its history."
        actions={
          <LinkButton href="/items/new" icon={PackagePlus}>
            Register an item
          </LinkButton>
        }
      />
      <div className="max-w-xl">
        <FindLabel />
      </div>
      <Suspense fallback={<div className="mt-6"><Skeleton lines={6} label="Loading items" /></div>}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

async function List({ searchParams }: { searchParams: PageProps<"/items">["searchParams"] }) {
  const params = await searchParams;
  const q = cleanSearch(one(params.q));
  const kind = one(params.kind);
  const category = one(params.category);
  const location = one(params.location);
  const condition = one(params.condition);
  // P1.18: "with a maintenance ticket not yet closed" (from What we own).
  const tickets = one(params.tickets) === "open" ? "open" : "";
  // P1.19: everything one company made, supplied or services (from a company page).
  const company = UUID.test(one(params.company)) ? one(params.company) : "";
  const page = Math.max(1, Number.parseInt(one(params.page) || "1", 10) || 1);

  const supabase = await createClient();
  // The lists for the drop-downs and the search itself are asked for at the
  // same time, so the page waits for the slower one only (keeps it fast with
  // thousands of rows). Only a location filter needs the places first, and
  // a main category (everything inside it, P1.17) the category list.
  const lookupsReady = loadLookups(supabase);
  const searchItems = async () => {
    let query = supabase
      .from("items")
      .select("id, label_serial, kind, name, category_id, location_id, condition", { count: "exact" })
      .order("name")
      .order("label_serial")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (q) query = query.or(await searchFilter(supabase, q, (await lookupsReady).categories));
    if (kind === "fixed_asset" || kind === "consumable") query = query.eq("kind", kind);
    if (UUID.test(category)) {
      const { categories } = await lookupsReady;
      query = query.in("category_id", categoryAndInside(category, categories));
    }
    if (UUID.test(location)) {
      const { locations } = await lookupsReady;
      query = query.in("location_id", locationAndInside(location, locations));
    }
    if (condition === "working") query = query.in("condition", WORKING);
    else if ((CONDITIONS as string[]).includes(condition)) query = query.eq("condition", condition);
    if (tickets) query = query.in("id", await itemsWithOpenTickets(supabase));
    if (company) query = query.or(await companyFilter(supabase, company));
    return must(await query);
  };
  const [lookups, { data, count }] = await Promise.all([lookupsReady, searchItems()]);
  const items = (data ?? []) as Pick<ItemRow, "id" | "label_serial" | "kind" | "name" | "category_id" | "location_id" | "condition">[];
  const consumableIds = items.filter((i) => i.kind === "consumable").map((i) => i.id);
  const { data: levels } = consumableIds.length
    ? await supabase.from("stock_levels").select("item_id, status").in("item_id", consumableIds)
    : { data: [] };
  const stockOf = new Map(((levels ?? []) as { item_id: string; status: StockStatus }[]).map((l) => [l.item_id, l.status]));
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || kind || category || location || condition || tickets || company);
  // P1.18: "lawnmower" also shows the Lawnmowers total first.
  const matched = q ? matchCategories(q, lookups.categories).slice(0, 4) : [];
  const matchedCounts = matched.length ? await categoryCounts(supabase, categoryGroups(lookups.categories, { showOff: true })) : null;

  const pageLink = (n: number, overrides: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, kind, category, location, condition, tickets, company, ...overrides })) if (v) p.set(k, v);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/items?${s}` : "/items";
  };

  const select = "mt-1 block min-h-11 w-full rounded-xl border border-icci-field bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green";
  return (
    <>
      <form data-folded="true" method="get" className="list-filters grid gap-3 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Search items">
        <label className="lg:col-span-2">
          <span className="font-semibold">Search</span>
          <input name="q" defaultValue={q} placeholder="Name, label, kind, make, model or company" className={select} />
        </label>
        <label>
          <span className="font-semibold">Kind</span>
          <select name="kind" defaultValue={kind} className={select}>
            <option value="">All kinds</option>
            <option value="fixed_asset">Fixed assets</option>
            <option value="consumable">Consumables</option>
          </select>
        </label>
        <label>
          <span className="font-semibold">Category</span>
          <select name="category" defaultValue={category} className={select}>
            <option value="">All categories</option>
            <CategoryOptions groups={categoryGroups(lookups.categories, { pickable: true, keep: category })} withMain />
          </select>
        </label>
        <label>
          <span className="font-semibold">Location</span>
          <select name="location" defaultValue={location} className={select}>
            <option value="">Everywhere</option>
            {locationOptions(lookups.locations).map((l) => (
              <option key={l.id} value={l.id}>
                {l.path}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Condition</span>
          <select name="condition" defaultValue={condition} className={select}>
            <option value="">Any condition</option>
            <option value="working">Working (good or fair)</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_STATUS[c].word}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900">
            Search
          </button>
          {filtered && (
            <Link href="/items" className="inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green! no-underline hover:bg-icci-green-50">
              Clear filters
            </Link>
          )}
        </div>
        {tickets && <input type="hidden" name="tickets" value={tickets} />}
        {company && <input type="hidden" name="company" value={company} />}
        <FilterFold />
      </form>

      {tickets && (
        <p className="mt-3 text-sm" data-testid="open-tickets-filter">
          Only items with a maintenance ticket not yet closed.{" "}
          <Link href={pageLink(1, { tickets: "" })}>Show all</Link>
        </p>
      )}

      {company && (
        <p className="mt-3 text-sm" data-testid="company-filter">
          Only what one company made, supplied or services. <Link href={pageLink(1, { company: "" })}>Show all</Link>
        </p>
      )}

      {matched.length > 0 && matchedCounts && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="matching-categories" aria-label="Matching categories">
          {matched.map((c) => {
            const main = c.parent_id ? lookups.categories.find((m) => m.id === c.parent_id) : c;
            return (
              <li key={c.id}>
                <CategoryTile href={`/items?category=${c.id}`} icon={main?.icon} name={lookups.categoryName.get(c.id) ?? c.name}>
                  <CountLine count={matchedCounts.get(c.id) ?? NO_COUNT} />
                </CategoryTile>
              </li>
            );
          })}
        </ul>
      )}

      <p className="list-count" data-testid="item-count">
        {total === 0 ? "No items match." : `${total} item${total === 1 ? "" : "s"}${pages > 1 ? ` · page ${page} of ${pages}` : ""}`}
      </p>

      {/* PC: a table. Phone: one card per item. */}
      {/* A6: an empty list says so in one calm card, with a way out of the filters. */}
      {total === 0 && (
        <div className="mt-4" data-testid="empty-list">
          <EmptyState
            icon={PackageSearch}
            title="No items match"
            action={filtered ? <LinkButton href="/items" kind="outline">Clear filters</LinkButton> : undefined}
          >
            {filtered ? "Nothing matches these filters." : "Try other words, or clear the filters to see every item."}
          </EmptyState>
        </div>
      )}
      <div className={total === 0 ? "hidden" : "list-table-wrap"}>
      <table className="list-table hidden md:table">
        <thead>
          <tr>
            <th className="px-3 py-2">Label</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Kind</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-icci-panel align-top">
              <td className="px-3 py-2 font-mono text-sm whitespace-nowrap">{i.label_serial}</td>
              <td className="px-3 py-2">
                <Link href={`/items/${i.id}`} className="font-semibold">
                  {i.name}
                </Link>
              </td>
              <td className="px-3 py-2">{KIND_LABEL[i.kind]}</td>
              <td className="px-3 py-2">{lookups.categoryName.get(i.category_id)}</td>
              <td className="px-3 py-2 text-sm">{lookups.locationName.get(i.location_id)}</td>
              <td className="px-3 py-2">
                <ItemStatus kind={i.kind} condition={i.condition} stock={stockOf.get(i.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {items.map((i) => (
          <li key={i.id}>
            <Link href={`/items/${i.id}`} className="list-card">
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-icci-green">{i.name}</span>
                <ItemStatus kind={i.kind} condition={i.condition} stock={stockOf.get(i.id)} />
              </span>
              <span className="mt-1 block text-sm">
                {i.label_serial} · {KIND_LABEL[i.kind]} · {lookups.categoryName.get(i.category_id)}
              </span>
              <span className="block text-sm">{lookups.locationName.get(i.location_id)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {pages > 1 && <Pagination page={page} size={PAGE_SIZE} total={total} hrefFor={pageLink} />}
    </>
  );
}
