// Stocktake (PLAN.md 5.1): start one for a room, carry on with one under way,
// and see stocktakes sent for approval.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDateTime, locationOptions } from "@/lib/items/rules";
import { decisionSummary, type DifferenceStatus, STOCKTAKE_STATUS } from "@/lib/stocktake/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups } from "../items/data";
import { StatusBadge } from "../items/ui";
import { adminNames } from "../stock/data";
import { STOCKTAKE_COLUMNS, type Stocktake } from "./data";
import { StartForm } from "./forms";

export const metadata: Metadata = { title: "Stocktake | ICCI Control Dashboard" };

export default function StocktakesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Stocktake</h1>
      <p className="mt-2">
        Scan everything in one room. The stocktake lists what was expected but not found, and every difference waits
        for a <strong>different admin</strong> to approve it.
      </p>
      <Suspense fallback={<p className="mt-4">Loading stocktakes…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

const MAY_RUN = ["super_admin", "centre_admin"];

async function Content() {
  const me = await requireAdmin();
  if (!MAY_RUN.includes(me.roleCode)) {
    // The database refuses anyway; this just says so plainly.
    return (
      <p className="mt-4 rounded-xl border border-[var(--icci-none-text)]/20 bg-[var(--icci-none-fill)] px-4 py-3" data-testid="cannot-stocktake">
        Your account cannot run stocktakes. Only a Super Admin or Centre Admin can.
      </p>
    );
  }
  const supabase = await createClient();
  const [{ data }, lookups, nameOf] = await Promise.all([
    supabase.from("stocktakes").select(STOCKTAKE_COLUMNS).order("id", { ascending: false }).limit(50),
    loadLookups(supabase),
    adminNames(supabase),
  ]);
  const stocktakes = (data ?? []) as Stocktake[];
  const sentIds = stocktakes.filter((s) => s.status === "submitted").map((s) => s.id);
  const { data: diffs } = sentIds.length
    ? await supabase.from("stocktake_differences").select("stocktake_id, status").in("stocktake_id", sentIds)
    : { data: [] };
  const statusesOf = new Map<number, DifferenceStatus[]>();
  for (const d of (diffs ?? []) as { stocktake_id: number; status: DifferenceStatus }[]) {
    statusesOf.set(d.stocktake_id, [...(statusesOf.get(d.stocktake_id) ?? []), d.status]);
  }

  const open = stocktakes.filter((s) => s.status === "open");
  const busy = new Set(open.map((s) => s.location_id));
  const rooms = locationOptions(
    lookups.locations.filter((l) => l.active !== false),
    ["room"],
  ).map((r) => ({ ...r, busy: busy.has(r.id) }));
  const sent = stocktakes.filter((s) => s.status === "submitted");

  return (
    <>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="text-lg font-bold text-icci-green-dark">Start a stocktake</h2>
          <StartForm rooms={rooms} />
        </section>
        <section>
          <h2 className="text-lg font-bold text-icci-green-dark">Under way</h2>
          {open.length === 0 ? (
            <p className="mt-3">No stocktake is under way.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {open.map((s) => (
                <li key={s.id} className="list-card" data-testid="open-stocktake">
                  <Link href={`/stocktake/${s.id}`} className="font-semibold">
                    {lookups.locationName.get(s.location_id)}
                  </Link>
                  <span className="block text-sm">
                    Stocktake {s.id} · started {formatDateTime(s.created_at)} by {nameOf(s.created_by)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-icci-green-dark">Sent for approval</h2>
        {sent.length === 0 ? (
          <p className="mt-3">None yet.</p>
        ) : (
          <>
          {/* A2: on a phone, cards instead of a wide table. */}
          <ul className="mt-3 space-y-2 md:hidden">
            {sent.map((s) => {
              const statuses = statusesOf.get(s.id) ?? [];
              const waiting = statuses.some((x) => x === "pending");
              return (
                <li key={s.id} className="list-card" data-testid="sent-stocktake-card">
                  <span className="flex items-start justify-between gap-2">
                    <Link href={`/stocktake/${s.id}`} className="font-semibold">
                      {lookups.locationName.get(s.location_id)}
                    </Link>
                    <StatusBadge word={decisionSummary(statuses)} tone={waiting ? "amber" : STOCKTAKE_STATUS.submitted.tone} />
                  </span>
                  <span className="block text-sm">
                    Sent {s.submitted_at ? formatDateTime(s.submitted_at) : ""} by {nameOf(s.submitted_by)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="list-table-wrap max-md:hidden">
            <table className="list-table min-w-[36rem]">
              <thead>
                <tr>
                  <th className="py-2 pr-3">Room</th>
                  <th className="py-2 pr-3">Sent</th>
                  <th className="py-2 pr-3">By</th>
                  <th className="py-2">Differences</th>
                </tr>
              </thead>
              <tbody>
                {sent.map((s) => {
                  const statuses = statusesOf.get(s.id) ?? [];
                  const waiting = statuses.some((x) => x === "pending");
                  return (
                    <tr key={s.id} className="border-b border-icci-panel" data-testid="sent-stocktake">
                      <td className="py-2 pr-3">
                        <Link href={`/stocktake/${s.id}`}>{lookups.locationName.get(s.location_id)}</Link>
                      </td>
                      <td className="py-2 pr-3">{s.submitted_at ? formatDateTime(s.submitted_at) : ""}</td>
                      <td className="py-2 pr-3">{nameOf(s.submitted_by)}</td>
                      <td className="py-2">
                        <StatusBadge
                          word={decisionSummary(statuses)}
                          tone={waiting ? "amber" : STOCKTAKE_STATUS.submitted.tone}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </>
  );
}
