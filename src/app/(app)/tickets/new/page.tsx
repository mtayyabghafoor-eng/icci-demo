// "Report a problem" (slice P3.5): phone-first. From an asset's page
// (/tickets/new?item=…) the place is the asset's own; otherwise pick a place.
// A4: from the menu, a search box finds the asset by name or label first
// (?find=…), for a problem phoned in to the office.
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
import { ContactCard } from "../../companies/contact-card";
import { ReportProblemForm } from "../forms";
import { BackLink } from "@/components/ui";
import { UUID } from "@/lib/forms";
import { cleanSearch } from "@/lib/items/rules";

export const metadata: Metadata = { title: "Report a problem | ICCI Control Dashboard" };

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
  const { item: rawItem, damage: rawDamage, find: rawFind } = await searchParams;
  const find = cleanSearch(typeof rawFind === "string" ? rawFind : "");
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
  // A4: the asset search (fixed assets that are not disposed), ten at most.
  const found =
    !item && find
      ? (((
          await supabase
            .from("items")
            .select("id, name, label_serial, location_id, condition")
            .eq("kind", "fixed_asset")
            .neq("condition", "disposed")
            .or(`name.ilike.%${find}%,label_serial.ilike.%${find}%`)
            .order("name")
            .limit(10)
        ).data ?? []) as { id: string; name: string; label_serial: string; location_id: string; condition: string }[])
      : [];

  return (
    <>
      <BackLink href={item ? `/items/${item.id}` : "/tickets"}>{item ? "← Back to the item" : "← All tickets"}</BackLink>
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
        <>
          <p className="mt-2">Something broken or not working? If it is a registered item, find it first; otherwise pick the place below.</p>
          <form method="get" role="search" aria-label="Find the item" className="mt-3 flex gap-2">
            <label htmlFor="find-item" className="sr-only">
              The item&apos;s name or label number
            </label>
            <input
              id="find-item"
              name="find"
              type="search"
              defaultValue={find}
              placeholder="e.g. lawnmower or ICCI-000123"
              className="block min-h-11 w-full rounded-xl border border-[#87948f] bg-white px-3.5 py-2"
              dir="auto"
            />
            <button type="submit" className="min-h-11 shrink-0 rounded-[10px] bg-icci-green-dark px-4 font-semibold text-white">
              Find
            </button>
          </form>
          {find && (
            <div className="mt-3" data-testid="found-items">
              {found.length === 0 ? (
                <p className="text-[15px]">No registered item matches &ldquo;{find}&rdquo;. Pick the place below instead.</p>
              ) : (
                <ul className="space-y-2">
                  {found.map((i) => (
                    <li key={i.id}>
                      <Link href={`/tickets/new?item=${i.id}`} className="list-card">
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-icci-green">{i.name}</span>
                          <ItemStatus kind="fixed_asset" condition={i.condition} />
                        </span>
                        <span className="block text-sm">
                          {i.label_serial} · {lookups.locationName.get(i.location_id)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
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
          {/* P1.21: who to call, the warranty and the manuals, before the report is even sent. */}
          {canReportItem && (
            <div className="mt-4">
              <ContactCard itemId={item.id} />
            </div>
          )}
          <ReportProblemForm
            itemId={canReportItem ? item.id : null}
            damageId={canReportItem ? damageId : null}
            canMarkDamaged={Boolean(canReportItem && !damageId && (item.condition === "good" || item.condition === "fair"))}
            places={reportPlaces(lookups)}
            people={people}
            myPersonId={myPersonId}
          />
        </>
      )}
    </>
  );
}
