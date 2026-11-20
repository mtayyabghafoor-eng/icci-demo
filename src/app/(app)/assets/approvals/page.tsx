// Disposals waiting for approval. A different admin approves or rejects;
// your own are shown without the buttons (the database refuses them anyway).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { describeDisposal } from "@/lib/assets/disposal";
import { ASSET_EVENT_COLUMNS, DISPOSAL_STATUS, type AssetEventRow } from "@/lib/assets/rules";
import { requireAdmin } from "@/lib/auth/current-admin";
import { CONDITION_STATUS, formatDateTime, formatEuro } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups, PHOTO_BUCKET } from "../../items/data";
import { Notice, StatusBadge } from "../../items/ui";
import { adminNames } from "../../stock/data";
import { Reporter, reporterNames } from "../../people/reporter";
import { DecideDisposalForm } from "../forms";

export const metadata: Metadata = { title: "Disposals waiting | ICCI Control Dashboard" };

export default function DisposalApprovalsPage(props: PageProps<"/assets/approvals">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <p className="text-sm">
        <Link className="back-link" href="/assets">← Missing and damaged</Link>
      </p>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Disposals Waiting</h1>
      <p className="mt-2">
        An asset is disposed of only after a <strong>different admin</strong> approves. Until then it stays as it is.
      </p>
      <Suspense fallback={<p className="mt-4">Loading disposals…</p>}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type Item = { id: string; name: string; label_serial: string; location_id: string; value_cents: number | null };

async function List({ searchParams }: { searchParams: PageProps<"/assets/approvals">["searchParams"] }) {
  const { done } = await searchParams;
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("asset_events").select(ASSET_EVENT_COLUMNS).eq("status", "pending").order("id");
  const pending = (data ?? []) as AssetEventRow[];

  const itemIds = [...new Set(pending.map((p) => p.item_id))];
  const withPhoto = pending.filter((p) => p.photo_path);
  const [items, nameOf, lookups, photos, reporters] = await Promise.all([
    itemIds.length ? supabase.from("items").select("id, name, label_serial, location_id, value_cents").in("id", itemIds) : { data: [] },
    adminNames(supabase),
    loadLookups(supabase),
    withPhoto.length
      ? supabase.storage.from(PHOTO_BUCKET).createSignedUrls(withPhoto.map((p) => p.photo_path!), 600)
      : { data: [] },
    reporterNames(supabase, pending),
  ]);
  // P3.6: warn when an asset waiting for disposal still has tickets not closed.
  const { data: openTickets } = itemIds.length
    ? await supabase.from("maintenance_tickets").select("id, item_id").in("item_id", itemIds).neq("status", "closed")
    : { data: [] };
  const openTicketsOf = new Map<string, number>();
  for (const t of (openTickets ?? []) as { item_id: string }[]) openTicketsOf.set(t.item_id, (openTicketsOf.get(t.item_id) ?? 0) + 1);
  const itemOf = new Map(((items.data ?? []) as Item[]).map((i) => [i.id, i]));
  const photoOf = new Map<number, string>();
  (photos.data ?? []).forEach((s, i) => s.signedUrl && photoOf.set(withPhoto[i].id, s.signedUrl));
  const waiting = DISPOSAL_STATUS.pending;

  return (
    <>
      {done === "approved" && <Notice>Disposal approved. The asset is now marked disposed.</Notice>}
      {done === "rejected" && <Notice>Disposal rejected. The asset stays as it was.</Notice>}
      <p className="mt-4" data-testid="pending-count">
        {pending.length === 0 ? "Nothing is waiting for approval." : `${pending.length} waiting.`}
      </p>
      <ul className="mt-3 space-y-3">
        {pending.map((p) => {
          const item = itemOf.get(p.item_id);
          const mine = p.created_by === me.id;
          const pic = photoOf.get(p.id);
          return (
            <li key={p.id} className="list-card" data-testid="pending-disposal">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p>
                  <Link href={`/items/${p.item_id}`} className="font-semibold">
                    {item?.name}
                  </Link>
                  <span className="block text-sm">
                    {item?.label_serial} · {item ? lookups.locationName.get(item.location_id) : ""}
                  </span>
                  <span className="block text-sm">
                    Value {formatEuro(item?.value_cents)} · condition now{" "}
                    {p.from_condition ? CONDITION_STATUS[p.from_condition].word : "unknown"}
                  </span>
                </p>
                <StatusBadge word={waiting.word} tone={waiting.tone} />
              </div>
              <div className="mt-2 flex gap-3">
                <div className="min-w-0 flex-1">
                  <p data-testid="disposal-route">
                    <span className="font-semibold">How it leaves:</span>{" "}
                    {describeDisposal({
                      disposal_route: p.disposal_route ?? null,
                      disposal_recipient: p.disposal_recipient ?? null,
                      sale_price_cents: p.sale_price_cents ?? null,
                      sale_buyer: p.sale_buyer ?? null,
                      sale_date: p.sale_date ?? null,
                      sale_money_taken_by: p.sale_money_taken_by ?? null,
                    })}
                  </p>
                  <p>
                    <span className="font-semibold">Note:</span> {p.note}
                  </p>
                  <p className="text-sm">
                    Reported by <Reporter event={p} names={reporters} /> · sent by {nameOf(p.created_by)} · {formatDateTime(p.created_at)}
                  </p>
                </div>
                {pic && (
                  // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link
                  <img src={pic} alt="Photo with this disposal" className="h-20 w-20 shrink-0 rounded-xl border border-icci-line object-cover" />
                )}
              </div>
              {(openTicketsOf.get(p.item_id) ?? 0) > 0 && (
                <p className="mt-3 rounded-xl border border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)] px-4 py-3" data-testid="open-tickets-warning">
                  This asset still has {openTicketsOf.get(p.item_id) === 1 ? "1 maintenance ticket" : `${openTicketsOf.get(p.item_id)} maintenance tickets`} not
                  closed. <Link href={`/items/${p.item_id}`}>See them on the asset&apos;s page</Link> before deciding.
                </p>
              )}
              {mine ? (
                <p className="mt-3 rounded-xl bg-icci-green-50 px-4 py-3">You sent this disposal, so a different admin must decide on it.</p>
              ) : (
                <DecideDisposalForm eventId={p.id} />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
