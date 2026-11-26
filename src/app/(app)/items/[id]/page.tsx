import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ASSET_ACTIONS,
  ASSET_EVENT_COLUMNS,
  actionsFor,
  describeEvent,
  DISPOSAL_STATUS,
  isAssetAction,
  type AssetEventRow,
} from "@/lib/assets/rules";
import { describeHistory, type HistoryRow } from "@/lib/items/history";
import { formatDate, formatDateTime, formatEuro, KIND_LABEL } from "@/lib/items/rules";
import { ADJUSTMENT_STATUS, describeUsage, MOVEMENT_LABEL } from "@/lib/stock/rules";
import { allRows } from "@/lib/supabase/all-rows";
import { createClient } from "@/lib/supabase/server";
import { listOrder, PRIORITY_LABEL, shortDescription, STATUS_LABEL, TICKET_COLUMNS, ticketNumber, type TicketRow } from "@/lib/tickets/rules";
import { Reporter, reporterNames } from "../../people/reporter";
import { adminNames, MOVEMENT_COLUMNS, stockLevelOf, type Movement } from "../../stock/data";
import { ITEM_COLUMNS, loadLookups, PHOTO_BUCKET, type ItemRow } from "../data";
import { ItemStatus, Notice, PrimaryLink, SecondaryLink, StatusBadge } from "../ui";
import { BackLink } from "@/components/ui";
import { allCompanies, allModels } from "../../companies/data";
import { ContactCard } from "../../companies/contact-card";
import { DocumentsCard } from "../../documents/documents-card";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Item | ICCI Control Dashboard" };

export default function ItemPage(props: PageProps<"/items/[id]">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading item…</p>}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content(props: { params: PageProps<"/items/[id]">["params"]; searchParams: PageProps<"/items/[id]">["searchParams"] }) {
  const { id } = await props.params;
  const { done } = await props.searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const item = data as ItemRow;

  const consumable = item.kind === "consumable";
  const [lookups, history, photo, level, moves, nameOf, events, vehicleRes, companies, models] = await Promise.all([
    loadLookups(supabase),
    // Round C2: every entry, newest first (migration 0057), page by page.
    allRows<HistoryRow>((from, to) => supabase.rpc("item_history", { p_item_id: id }).range(from, to)),
    item.photo_path ? supabase.storage.from(PHOTO_BUCKET).createSignedUrl(item.photo_path, 600) : null,
    consumable ? stockLevelOf(supabase, id) : null,
    consumable
      ? allRows<Movement>((from, to) => supabase.from("stock_movements").select(MOVEMENT_COLUMNS).eq("item_id", id).order("id", { ascending: false }).range(from, to))
      : null,
    adminNames(supabase),
    consumable
      ? null
      : allRows<AssetEventRow>((from, to) => supabase.from("asset_events").select(ASSET_EVENT_COLUMNS).eq("item_id", id).order("id", { ascending: false }).range(from, to)),
    // P2.7: vehicle details, if this asset is a vehicle.
    consumable ? null : supabase.from("vehicles").select("id, registration").eq("item_id", id).maybeSingle(),
    // P1.19: company and make-and-model names for the details and the history.
    allCompanies(supabase),
    allModels(supabase),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const modelName = new Map(models.map((m) => [m.id, `${companyName.get(m.maker_company_id) ?? ""} ${m.model_name}`.trim()]));
  // P3.5: this asset's maintenance tickets, not yet closed first.
  const ticketsRes = consumable
    ? null
    : await supabase.from("maintenance_tickets").select(TICKET_COLUMNS).eq("item_id", id).order("id", { ascending: false }).limit(100);
  const tickets = ((ticketsRes?.data ?? []) as TicketRow[]).sort(listOrder);
  const vehicle = (vehicleRes?.data ?? null) as { id: string; registration: string } | null;
  const assetEvents = events ?? [];
  // P3.6: the damage report just made (newest first), for "Open a ticket for this".
  const latestDamage = item.condition === "damaged" ? assetEvents.find((e) => e.kind === "damage") : undefined;
  const reporters = await reporterNames(supabase, assetEvents);
  const eventPhotos = new Map<number, string>();
  const withPhoto = assetEvents.filter((e) => e.photo_path);
  if (withPhoto.length) {
    const { data: signed } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(withPhoto.map((e) => e.photo_path!), 600);
    (signed ?? []).forEach((s, i) => s.signedUrl && eventPhotos.set(withPhoto[i].id, s.signedUrl));
  }
  const disposalPending = assetEvents.some((e) => e.status === "pending");
  const assetActions = consumable ? [] : actionsFor(item.condition, disposalPending);
  const movements = moves ?? [];
  const movementById = new Map(movements.map((m) => [m.id, m]));
  const pendingFor = new Set(movements.filter((m) => m.status === "pending").map((m) => m.corrects_id));
  const lines = describeHistory(history, {
    categories: lookups.categoryName,
    locations: lookups.locationName,
    companies: companyName,
    models: modelName,
  });

  const fields: [string, string][] = [
    ["Label", item.label_serial],
    ["Kind", KIND_LABEL[item.kind]],
    ["Category", lookups.categoryName.get(item.category_id) ?? ""],
    ["Location", lookups.locationName.get(item.location_id) ?? ""],
    ...(item.kind === "fixed_asset"
      ? ([
          ["Value", formatEuro(item.value_cents)],
          ["Purchase date", formatDate(item.purchase_date)],
          ["Warranty end", formatDate(item.warranty_end)],
          ["Make and model", item.model_id ? (modelName.get(item.model_id) ?? "") : "Not recorded"],
          ["Maker's serial number", item.maker_serial ?? "Not recorded"],
          ["Supplied by", item.supplier_company_id ? (companyName.get(item.supplier_company_id) ?? "") : "Not recorded"],
          ["Serviced by", item.service_company_id ? (companyName.get(item.service_company_id) ?? "") : "The model's or category's company"],
        ] as [string, string][])
      : ([
          ["Counted in", item.unit ?? ""],
          ["Minimum level", String(item.minimum_level ?? "")],
          ["Quantity now", level?.quantity == null ? "Not counted yet" : `${level.quantity} ${item.unit}`],
          ["Last counted", level?.last_counted_at ? formatDateTime(level.last_counted_at) : "Never"],
          ["Usage", describeUsage(level?.usage_since_previous_count ?? null, item.unit ?? "")],
          ["Supplied by", item.supplier_company_id ? (companyName.get(item.supplier_company_id) ?? "") : "Not recorded"],
        ] as [string, string][])),
    ["Notes", item.notes || "None"],
  ];

  return (
    <>
      <BackLink href="/items">All items</BackLink>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]">{item.name}</h1>
        <ItemStatus kind={item.kind} condition={item.condition} stock={level?.status} />
      </div>
      {done === "registered" && <Notice floating>Item registered. Label {item.label_serial} now opens this page.</Notice>}
      {done === "saved" && <Notice floating>Changes saved. The history below shows what changed.</Notice>}
      {done === "counted" && <Notice floating>Count saved.</Notice>}
      {done === "restocked" && <Notice floating>Stock added.</Notice>}
      {done === "correction" && <Notice floating>Correction sent. It counts once a different admin approves it.</Notice>}
      {done === "document-added" && <Notice floating>Document added.</Notice>}
      {done === "document-hidden" && <Notice floating>Document hidden. It stays in the record.</Notice>}
      {typeof done === "string" && isAssetAction(done) && (
        // A damage report offers "Open a ticket for this": that link must stay on the page.
        <Notice floating={!(done === "damage" && latestDamage && !tickets.some((t) => t.asset_event_id === latestDamage.id))}>
          {ASSET_ACTIONS[done].done}
          {/* P3.6: a damage report can become a maintenance ticket that remembers it. */}
          {done === "damage" && latestDamage && !tickets.some((t) => t.asset_event_id === latestDamage.id) && (
            <>
              {" "}
              <Link href={`/tickets/new?item=${item.id}&damage=${latestDamage.id}`} className="font-semibold">
                Open a ticket for this
              </Link>
            </>
          )}
        </Notice>
      )}

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_280px]">
        {/* A2: on a phone the buttons come first (after a scan the job is to act), then the details. */}
        <section className="flex flex-col rounded-2xl border border-icci-line bg-white shadow-card p-5 max-md:[&>*:nth-child(2)]:mt-0" aria-label="Details">
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[160px_1fr] max-md:order-last max-md:mt-5 max-md:border-t max-md:border-icci-line max-md:pt-4">
            {fields.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-sm font-semibold text-icci-ink-60">{k}</dt>
                <dd className="mb-2 whitespace-pre-line sm:mb-0">{v}</dd>
              </div>
            ))}
          </dl>
          {consumable && (
            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
              <PrimaryLink href={`/items/${item.id}/count`}>Count this shelf</PrimaryLink>
              <PrimaryLink href={`/items/${item.id}/restock`}>Add stock</PrimaryLink>
            </div>
          )}
          {assetActions.length > 0 && (
            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap" data-testid="asset-actions">
              {/* A4: one way to report: a fault, or (ticked) broken or damaged. */}
              <PrimaryLink href={`/tickets/new?item=${item.id}`}>Report a problem</PrimaryLink>
              {assetActions.map((a) =>
                a === "dispose" ? (
                  <SecondaryLink key={a} href={`/items/${item.id}/asset/${a}`}>
                    {ASSET_ACTIONS[a].button}
                  </SecondaryLink>
                ) : (
                  <PrimaryLink key={a} href={`/items/${item.id}/asset/${a}`}>
                    {ASSET_ACTIONS[a].button}
                  </PrimaryLink>
                ),
              )}
            </div>
          )}
          {disposalPending && (
            <p className="mt-4 rounded-xl border border-icci-line bg-white px-4 py-3">
              A disposal of this asset is waiting for approval by a different admin.{" "}
              <Link href="/assets/approvals">See it</Link>
            </p>
          )}
          {item.condition === "disposed" && (
            <p className="mt-4 rounded-xl border border-icci-line bg-white px-4 py-3">This asset has been disposed of. Its record and history are kept.</p>
          )}
          {vehicle && (
            <p className="mt-4 rounded-xl border border-icci-line bg-white px-4 py-3" data-testid="item-vehicle">
              This asset is the vehicle <strong>{vehicle.registration}</strong>. Motor tax, insurance and NCT are on{" "}
              <Link href={`/vehicles/${vehicle.id}`}>its vehicle page</Link>.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {!consumable && item.condition !== "disposed" && assetActions.length === 0 && (
              <SecondaryLink href={`/tickets/new?item=${item.id}`}>Report a problem</SecondaryLink>
            )}
            <SecondaryLink href={`/items/${item.id}/edit`}>Edit details</SecondaryLink>
          </div>
        </section>
        <section aria-label="Photo">
          {photo?.data?.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link
            <img src={photo.data.signedUrl} alt={`Photo of ${item.name}`} className="w-full rounded-2xl border border-icci-line object-cover shadow-card" />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-icci-gold-300 bg-white text-sm text-icci-ink-60">
              No photo yet
            </div>
          )}
        </section>
      </div>

      {/* P1.20 and P1.21: who to call, warranty, manuals and this item's own documents. */}
      {!consumable && item.condition !== "disposed" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ContactCard itemId={id} />
          <DocumentsCard owner={{ item_id: id }} returnTo={`/items/${id}`} />
        </div>
      )}

      {consumable && (
        <section className="mt-8" aria-labelledby="stock-title">
          <h2 id="stock-title" className="text-lg font-bold text-icci-green-dark">
            Stock entries
          </h2>
          <p className="text-sm">
            Counts, restocks and corrections. Entries are never changed: a wrong one is corrected. Newest first.
          </p>
          {movements.length === 0 ? (
            <p className="mt-3">No stock entries yet.</p>
          ) : (
            <ol className="mt-3 space-y-2" data-testid="stock-entries">
              {movements.map((m) => {
                const corrected = m.corrects_id ? movementById.get(m.corrects_id) : undefined;
                const s = ADJUSTMENT_STATUS[m.status];
                const what =
                  m.kind === "adjustment"
                    ? `Correction: ${corrected ? MOVEMENT_LABEL[corrected.kind].toLowerCase() : "entry"} of ${corrected?.quantity ?? "?"} → ${m.quantity} ${item.unit}`
                    : m.kind === "count"
                      ? `Count: ${m.quantity} ${item.unit} found`
                      : `Restock: +${m.quantity} ${item.unit}`;
                return (
                  <li key={m.id} className="rounded-xl border border-icci-line bg-white p-4 shadow-card">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{what}</span>
                      {s && <StatusBadge word={s.word} tone={s.tone} />}
                    </p>
                    <p className="text-sm">
                      {formatDateTime(m.created_at)} · {nameOf(m.created_by)}
                    </p>
                    {m.reason && <p className="text-sm">Reason: {m.reason}</p>}
                    {m.decided_at && (
                      <p className="text-sm">
                        {m.status === "approved" ? "Approved" : "Rejected"} by {nameOf(m.decided_by)} ·{" "}
                        {formatDateTime(m.decided_at)}
                        {m.decision_note ? ` · ${m.decision_note}` : ""}
                      </p>
                    )}
                    {m.kind !== "adjustment" &&
                      (pendingFor.has(m.id) ? (
                        <p className="text-sm">A correction of this entry is waiting for approval.</p>
                      ) : (
                        <Link
                          href={`/items/${item.id}/correct?entry=${m.id}`}
                          className="inline-flex min-h-11 items-center text-sm font-semibold"
                        >
                          Correct this entry
                        </Link>
                      ))}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {!consumable && (
        <section className="mt-8" aria-labelledby="asset-title">
          <h2 id="asset-title" className="text-lg font-bold text-icci-green-dark">
            Moves and reports
          </h2>
          <p className="text-sm">Moves, damage, missing, found, repaired and disposal. Entries are never changed. Newest first.</p>
          {assetEvents.length === 0 ? (
            <p className="mt-3">Nothing reported yet.</p>
          ) : (
            <ol className="mt-3 space-y-2" data-testid="asset-events">
              {assetEvents.map((e) => {
                const s = e.kind === "disposal" ? DISPOSAL_STATUS[e.status] : undefined;
                const pic = eventPhotos.get(e.id);
                return (
                  <li key={e.id} className="flex gap-3 rounded-xl border border-icci-line bg-white p-4 shadow-card">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{describeEvent(e, lookups.locationName)}</span>
                        {s && <StatusBadge word={s.word} tone={s.tone} />}
                      </p>
                      <p className="text-sm whitespace-pre-line">{e.note}</p>
                      <p className="text-sm">
                        Reported by <Reporter event={e} names={reporters} /> · entered by {nameOf(e.created_by)} · {formatDateTime(e.created_at)}
                      </p>
                      {e.decided_at && (
                        <p className="text-sm">
                          {e.status === "approved" ? "Approved" : "Rejected"} by {nameOf(e.decided_by)} · {formatDateTime(e.decided_at)}
                          {e.decision_note ? ` · ${e.decision_note}` : ""}
                        </p>
                      )}
                    </div>
                    {pic && (
                      // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link
                      <img src={pic} alt={`Photo with this entry`} className="h-20 w-20 shrink-0 rounded-xl border border-icci-line object-cover" />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {!consumable && (
        <section className="mt-8" aria-labelledby="tickets-title">
          <h2 id="tickets-title" className="text-lg font-bold text-icci-green-dark">
            Maintenance tickets
          </h2>
          <p className="text-sm">Problems reported with this asset. Not yet closed first.</p>
          {tickets.length === 0 ? (
            <p className="mt-3">No tickets for this asset.</p>
          ) : (
            <ul className="mt-3 space-y-2" data-testid="item-tickets">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/tickets/${t.id}`} className="list-card">
                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="font-semibold text-icci-green" dir="auto">
                        {shortDescription(t.description, 80)}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        <StatusBadge {...STATUS_LABEL[t.status]} />
                        {t.priority === "urgent" && <StatusBadge {...PRIORITY_LABEL.urgent} />}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm">
                      {ticketNumber(t.id)} · reported {formatDate(t.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-8" aria-labelledby="history-title">
        <h2 id="history-title" className="text-lg font-bold text-icci-green-dark">
          History
        </h2>
        <p className="text-sm">Every change to the item&apos;s details is kept. Newest first.</p>
        <ol className="mt-3 space-y-3 border-l-2 border-icci-gold pl-4" data-testid="history">
          {lines.map((line) => (
            <li key={line.id} className="rounded-xl border border-icci-line bg-white p-4 shadow-card">
              <p>
                <span className="font-semibold">{line.title}</span> · {formatDateTime(line.when)} · {line.who}
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {line.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
