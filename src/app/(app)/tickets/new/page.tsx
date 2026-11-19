// "Report a problem" (slice P3.5): phone-first. From an asset's page
// (/tickets/new?item=…) the place is the asset's own; otherwise pick a place.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { allRows } from "@/lib/supabase/all-rows";
import { createClient } from "@/lib/supabase/server";
import { MAY_SEE_TICKETS } from "@/lib/tickets/rules";
import { loadLookups } from "../../items/data";
import { ItemStatus } from "../../items/ui";
import { CannotSeeTickets } from "../cannot-see";
import { reportPlaces } from "../data";
import { ReportProblemForm } from "../forms";

export const metadata: Metadata = { title: "Report a problem | ICCI Control Dashboard" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ReportPage(props: PageProps<"/tickets/new">) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/tickets/new">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_TICKETS.includes(me.roleCode)) {
    return (
      <>
        <h1 className="page-title text-[28px] md:text-[34px]">Report a Problem</h1>
        <CannotSeeTickets />
      </>
    );
  }
  const { item: rawItem, damage: rawDamage } = await searchParams;
  const itemId = typeof rawItem === "string" && UUID.test(rawItem) ? rawItem : null;
  // P3.6: opened from "Report damage" on that asset (the database checks it is that asset's damage report).
  const damageId = itemId && typeof rawDamage === "string" && /^\d{1,12}$/.test(rawDamage) ? Number(rawDamage) : null;

  const supabase = await createClient();
  const [lookups, people, itemRes] = await Promise.all([
    loadLookups(supabase),
    allRows<{ id: string; full_name: string; app_user_id: string | null }>((from, to) =>
      supabase.from("people").select("id, full_name, app_user_id").eq("active", true).order("full_name").order("id").range(from, to),
    ),
    itemId ? supabase.from("items").select("id, name, kind, label_serial, location_id, condition").eq("id", itemId).maybeSingle() : null,
  ]);
  const myPersonId = people.find((p) => p.app_user_id === me.id)?.id ?? null;
  const item = (itemRes?.data ?? null) as
    | { id: string; name: string; kind: string; label_serial: string; location_id: string; condition: string | null }
    | null;
  const canReportItem = item && item.kind === "fixed_asset" && item.condition !== "disposed";

  return (
    <>
      <p className="text-sm">
        <Link className="back-link" href={item ? `/items/${item.id}` : "/tickets"}>
          {item ? "← Back to the item" : "← All tickets"}
        </Link>
      </p>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Report a Problem</h1>
      {item ? (
        <>
          <p className="mt-2 text-lg font-semibold">{item.name}</p>
          <p className="text-sm">
            {item.label_serial} · {lookups.locationName.get(item.location_id)}
          </p>
          <p className="mt-2">
            <ItemStatus kind={item.kind} condition={item.condition} />
          </p>
        </>
      ) : (
        <p className="mt-2">
          Something broken or not working? To report a problem with one asset, scan its label and press{" "}
          <strong>Report a problem</strong> there instead.
        </p>
      )}
      {itemId && !canReportItem ? (
        <p className="mt-4 rounded-xl bg-icci-green-50 px-4 py-3">
          {item ? "A ticket can only be opened for a fixed asset that has not been disposed of." : "This item could not be found."}{" "}
          <Link href="/tickets/new">Report a problem with a place instead</Link>.
        </p>
      ) : (
        <>
          {canReportItem && damageId && (
            <p className="mt-4 rounded-xl border border-icci-line bg-white px-4 py-3" data-testid="from-damage">
              This ticket will be linked to the damage report just made.
            </p>
          )}
          <ReportProblemForm
            itemId={canReportItem ? item.id : null}
            damageId={canReportItem ? damageId : null}
            places={reportPlaces(lookups)}
            people={people}
            myPersonId={myPersonId}
          />
        </>
      )}
    </>
  );
}
