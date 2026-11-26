// The vehicles list (slice P2.7): registration, keeper, and motor tax,
// insurance and NCT with a coloured word each, worst first. Switched-off and
// disposed vehicles are folded away. Designed for a PC first; one card per
// vehicle on a phone. Super Admin and Centre Admin only.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { DATE_STATUS, dateOf, DUE_WITHIN_DAYS, KIND_LABEL, MAY_SEE_VEHICLES, RENEWAL_KINDS, VEHICLE_COLUMNS, worstFirst, type VehicleRow } from "@/lib/vehicles/rules";
import { CannotSee, PrimaryLink, Skeleton, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Vehicles | ICCI Control Dashboard" };

/** How many switched-off vehicles the fold shows (there can be many). */
const OFF_SHOWN = 50;

export default function VehiclesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Vehicles</h1>
      <p className="mt-2">
        Motor tax, insurance and NCT for each vehicle, worst first. &ldquo;Due soon&rdquo; means within {DUE_WITHIN_DAYS} days.
      </p>
      <Suspense fallback={<Skeleton />}>
        <List />
      </Suspense>
    </main>
  );
}

async function List() {
  const me = await requireAdmin();
  if (!MAY_SEE_VEHICLES.includes(me.roleCode)) return <CannotSee area="vehicles" />;
  const supabase = await createClient();
  // Switched-on vehicles in full; only some switched-off ones (there can be
  // many), with a count of them all.
  const [{ data }, { data: offData, count: offCount }] = await Promise.all([
    supabase.from("vehicle_status").select(VEHICLE_COLUMNS).eq("active", true),
    supabase.from("vehicle_status").select(VEHICLE_COLUMNS, { count: "exact" }).eq("active", false).order("registration").limit(OFF_SHOWN),
  ]);
  const all = [...((data ?? []) as VehicleRow[]), ...((offData ?? []) as VehicleRow[])];
  const keeperIds = [...new Set(all.flatMap((v) => (v.keeper_person_id ? [v.keeper_person_id] : [])))];
  const { data: people } = keeperIds.length ? await supabase.from("people").select("id, full_name").in("id", keeperIds) : { data: [] };
  const inUse = worstFirst(all.filter((v) => v.active && v.condition !== "disposed"));
  const off = all.filter((v) => !v.active || v.condition === "disposed").sort((a, b) => a.registration.localeCompare(b.registration));
  const keeper = new Map(((people ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="vehicle-count">
          {inUse.length === 0 ? "No vehicles yet." : `${inUse.length} ${inUse.length === 1 ? "vehicle" : "vehicles"}`}
        </p>
        <PrimaryLink href="/vehicles/new">Register a vehicle</PrimaryLink>
      </div>
      <Rows rows={inUse} keeper={keeper} testId="vehicle-row" />
      {off.length > 0 && (
        <details className="mt-6">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">
            Switched off or disposed of ({off.length - ((offData ?? []).length) + (offCount ?? 0)})
          </summary>
          <Rows rows={off} keeper={keeper} testId="vehicle-row-off" />
        </details>
      )}
      <p className="mt-4 text-sm">Only the dates are kept, never the tax disc, certificate or insurance policy.</p>
    </>
  );
}

function DateCell({ v, kind }: { v: VehicleRow; kind: (typeof RENEWAL_KINDS)[number] }) {
  const d = dateOf(v, kind);
  return (
    <span className="flex flex-col items-start gap-1" data-testid={`date-${kind}`}>
      <StatusBadge {...DATE_STATUS[d.status]} />
      {d.until && <span className="text-sm">{formatDate(d.until)}</span>}
    </span>
  );
}

function Rows({ rows, keeper, testId }: { rows: VehicleRow[]; keeper: Map<string, string>; testId: string }) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="list-table-wrap">
        <table className="list-table hidden md:table">
          <thead>
            <tr>
              <th className="px-3 py-2">Registration</th>
              <th className="px-3 py-2">Vehicle</th>
              <th className="px-3 py-2">Keeper</th>
              {RENEWAL_KINDS.map((k) => (
                <th key={k} className="px-3 py-2">
                  {KIND_LABEL[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} data-testid={testId} className="border-b border-icci-panel align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={`/vehicles/${v.id}`} className="font-semibold">
                    {v.registration}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {v.make_model ?? v.item_name}
                  <span className="block text-sm">{v.label_serial}</span>
                </td>
                <td className="px-3 py-2" dir="auto">
                  {v.keeper_person_id ? keeper.get(v.keeper_person_id) : "Nobody"}
                </td>
                {RENEWAL_KINDS.map((k) => (
                  <td key={k} className="px-3 py-2">
                    <DateCell v={v} kind={k} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((v) => (
          <li key={v.id}>
            <Link href={`/vehicles/${v.id}`} data-testid={testId} className="list-card">
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-icci-green">{v.registration}</span>
                <span className="text-sm">{v.make_model ?? v.item_name}</span>
              </span>
              <span className="mt-1 block text-sm" dir="auto">
                Keeper: {v.keeper_person_id ? keeper.get(v.keeper_person_id) : "nobody"}
              </span>
              <span className="mt-2 grid grid-cols-3 gap-2">
                {RENEWAL_KINDS.map((k) => (
                  <span key={k}>
                    <span className="block text-[13px] font-semibold">{KIND_LABEL[k]}</span>
                    <DateCell v={v} kind={k} />
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
