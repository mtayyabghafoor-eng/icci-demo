// The low-stock list: every consumable at or below its minimum, or out.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatDateTime } from "@/lib/items/rules";
import { STOCK_STATUS } from "@/lib/stock/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups } from "../items/data";
import { PrimaryLink, SecondaryLink, StatusBadge } from "../items/ui";
import type { StockLevel } from "./data";

export const metadata: Metadata = { title: "Low stock | ICCI Control Dashboard" };

export default function StockPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]">Low Stock</h1>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <PrimaryLink href="/stock/count">Weekly count</PrimaryLink>
          <Suspense fallback={<SecondaryLink href="/stock/approvals">Waiting for approval</SecondaryLink>}>
            <ApprovalsLink />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<p className="mt-6">Loading stock…</p>}>
        <List />
      </Suspense>
    </main>
  );
}

async function ApprovalsLink() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return <SecondaryLink href="/stock/approvals">{`Waiting for approval (${count ?? 0})`}</SecondaryLink>;
}

async function List() {
  const supabase = await createClient();
  const [low, uncounted, lookups] = await Promise.all([
    supabase.from("stock_levels").select("*").in("status", ["out", "low"]).order("quantity").order("name"),
    supabase.from("stock_levels").select("item_id", { count: "exact", head: true }).eq("status", "not_counted"),
    loadLookups(supabase),
  ]);
  const rows = (low.data ?? []) as StockLevel[];
  const place = (id: string) => lookups.locationName.get(id) ?? "";

  return (
    <>
      <p className="list-count" data-testid="low-count">
        {rows.length === 0
          ? "Nothing is low. Every counted item is above its minimum."
          : `${rows.length} item${rows.length === 1 ? " is" : "s are"} low or out. Low means at or below the minimum.`}
      </p>
      {(uncounted.count ?? 0) > 0 && (
        <p className="mt-1 text-sm">
          {uncounted.count} consumable{uncounted.count === 1 ? " has" : "s have"} not been counted yet, so{" "}
          {uncounted.count === 1 ? "it is" : "they are"} not on this list.
        </p>
      )}

      {/* PC: a table. Phone: one card per item. */}
      <div className="list-table-wrap">
      <table className="list-table hidden md:table" data-testid="low-stock">
        <thead>
          <tr>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Where</th>
            <th className="px-3 py-2 text-right">Now</th>
            <th className="px-3 py-2 text-right">Minimum</th>
            <th className="px-3 py-2">Last counted</th>
            <th className="px-3 py-2"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = STOCK_STATUS[r.status];
            return (
              <tr key={r.item_id} className="border-b border-icci-panel align-top">
                <td className="px-3 py-2">
                  <StatusBadge word={s.word} tone={s.tone} />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/items/${r.item_id}`} className="font-semibold">
                    {r.name}
                  </Link>
                  <span className="block font-mono text-sm">{r.label_serial}</span>
                </td>
                <td className="px-3 py-2 text-sm">{place(r.location_id)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {r.quantity} {r.unit}
                </td>
                <td className="px-3 py-2 text-right">{r.minimum_level}</td>
                <td className="px-3 py-2 text-sm">{r.last_counted_at ? formatDateTime(r.last_counted_at) : ""}</td>
                <td className="px-3 py-2">
                  <Link href={`/items/${r.item_id}/restock`} className="font-semibold whitespace-nowrap">
                    Add stock
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((r) => {
          const s = STOCK_STATUS[r.status];
          return (
            <li key={r.item_id} className="list-card">
              <span className="flex items-start justify-between gap-2">
                <Link href={`/items/${r.item_id}`} className="font-semibold">
                  {r.name}
                </Link>
                <StatusBadge word={s.word} tone={s.tone} />
              </span>
              <span className="mt-1 block">
                {r.quantity} {r.unit} now · minimum {r.minimum_level}
              </span>
              <span className="block text-sm">
                {r.label_serial} · {place(r.location_id)}
              </span>
              <span className="mt-2 block">
                <SecondaryLink href={`/items/${r.item_id}/restock`}>Add stock</SecondaryLink>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
