// The asset register by place and value (PLAN.md 5.1 screens), with a CSV
// download. First a total for each place; pick a place to see its assets,
// most valuable first. Designed for a PC first; cards on a phone.
import type { Metadata } from "next";
import { FilterFold } from "@/components/ui/filter-fold";
import Link from "next/link";
import { Suspense } from "react";
import { groupByPlace, MAY_SEE_ASSET_LISTS } from "@/lib/assets/lists";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate, formatEuro, locationOptions } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { ItemStatus } from "../../items/ui";
import { CannotSeeAssets } from "../cannot-see";
import { loadRegister } from "./data";

export const metadata: Metadata = { title: "Asset register | ICCI Control Dashboard" };

export default function RegisterPage(props: PageProps<"/assets/register">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Asset Register</h1>
      <p className="mt-2">
        Every fixed asset the Centre still has, by place and value. Disposed assets are not included. Consumables are
        counted, not valued, so they are not listed here.
      </p>
      <Suspense fallback={<p className="mt-6">Loading the register…</p>}>
        <Register searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

const plural = (n: number) => `${n} asset${n === 1 ? "" : "s"}`;

async function Register({ searchParams }: { searchParams: PageProps<"/assets/register">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ASSET_LISTS.includes(me.roleCode)) return <CannotSeeAssets />;

  const params = await searchParams;
  const supabase = await createClient();
  const { rows, place, placeName, placeIdOf, lookups } = await loadRegister(supabase, typeof params.place === "string" ? params.place : "");
  const groups = groupByPlace(rows);
  const total = groups.reduce((sum, g) => sum + g.total_cents, 0);
  const withoutValue = groups.reduce((sum, g) => sum + g.without_value, 0);
  const field = "mt-1 block min-h-11 w-full rounded-xl border border-[#87948f] bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green";
  const csvHref = `/assets/register/csv${place ? `?place=${encodeURIComponent(place)}` : ""}`;

  return (
    <>
      <form data-folded="true" method="get" className="list-filters flex flex-wrap items-end gap-3" aria-label="Choose a place">
        <label className="min-w-64 flex-1">
          <span className="font-semibold">Place</span>
          <select name="place" defaultValue={place} className={field}>
            <option value="">Everywhere (totals by place)</option>
            {locationOptions(lookups.locations).map((l) => (
              <option key={l.id} value={l.id}>
                {l.path}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900">
          Show
        </button>
        {place && (
          <Link href="/assets/register" className="inline-flex min-h-11 items-center px-2 font-semibold">
            Back to all places
          </Link>
        )}
        <a
          href={csvHref}
          download
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white px-4 py-2 font-semibold text-icci-green! no-underline transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50 ml-auto"
        >
          Download CSV
        </a>
        <FilterFold />
      </form>

      <p className="mt-5 text-lg font-semibold text-icci-green-dark" data-testid="register-total">
        <span className="font-semibold">{place ? `${placeName} and inside: ` : "Total: "}</span>
        {plural(rows.length)} · {formatEuro(total)}
        {withoutValue > 0 && <span className="block text-base">{withoutValue} with no value recorded (not in the total).</span>}
      </p>

      {/* Totals by place */}
      <div className="list-table-wrap">
      <table className="list-table">
        <thead>
          <tr>
            <th className="px-3 py-2">Place</th>
            <th className="px-3 py-2 text-right">Assets</th>
            <th className="px-3 py-2 text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.place} className="border-b border-icci-panel align-top">
              <td className="px-3 py-2">
                <Link href={`/assets/register?place=${encodeURIComponent(placeIdOf.get(g.place) ?? "")}`} className="font-semibold">
                  {g.place}
                </Link>
              </td>
              <td className="px-3 py-2 text-right">{g.rows.length}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {formatEuro(g.total_cents)}
                {g.without_value > 0 && <span className="block text-sm">{g.without_value} not valued</span>}
              </td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-2">
                No assets here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {/* One place chosen: its assets, most valuable first */}
      {place &&
        groups.map((g) => (
          <section key={g.place} className="mt-6" data-testid="register-place-assets">
            <h2 className="text-lg font-bold text-icci-green-dark">
              {g.place} <span className="text-base font-normal">· {plural(g.rows.length)} · {formatEuro(g.total_cents)}</span>
            </h2>
            <div className="list-table-wrap">
            <table className="list-table hidden md:table">
              <thead>
                <tr>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Bought</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.id} className="border-b border-icci-panel align-top">
                    <td className="px-3 py-2 font-mono text-sm whitespace-nowrap">
                      <Link href={`/items/${r.id}`}>{r.label_serial}</Link>
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-sm">{r.category}</td>
                    <td className="px-3 py-2 text-sm whitespace-nowrap">{formatDate(r.purchase_date)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatEuro(r.value_cents)}</td>
                    <td className="px-3 py-2">
                      <ItemStatus kind="fixed_asset" condition={r.condition as never} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <ul className="mt-3 space-y-3 md:hidden">
              {g.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/items/${r.id}`} className="list-card">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-icci-green">{r.name}</span>
                      <ItemStatus kind="fixed_asset" condition={r.condition as never} />
                    </span>
                    <span className="mt-1 block text-sm">
                      {r.label_serial} · {r.category} · {formatEuro(r.value_cents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}
