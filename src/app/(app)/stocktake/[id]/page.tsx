// One stocktake.
//   Under way: how to scan, what has been scanned so far, "Check and finish".
//   Sent: every difference, each approved or rejected on its own by a
//   different admin (the database refuses anyone who took part).
import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDateTime, locationAndInside } from "@/lib/items/rules";
import {
  DIFFERENCE_EFFECT,
  DIFFERENCE_STATUS,
  DIFFERENCE_TITLE,
  describeAssetDifference,
  describeQuantity,
  parseStocktakeId,
  SCANNING_COOKIE,
  STOCKTAKE_STATUS,
} from "@/lib/stocktake/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups } from "../../items/data";
import { adminNames } from "../../stock/data";
import { carryOn, stopScanning } from "../actions";
import { type Difference, loadItems, loadScans, loadStocktake } from "../data";
import { DecideDifferenceForm, LabelBox, StocktakeCamera } from "../forms";
import { BackLink, PageNotice, PrimaryLink, Skeleton, StatusBadge } from "@/components/ui";
import { quantityWord } from "@/lib/ui/text";

export const metadata: Metadata = { title: "Stocktake | ICCI Control Dashboard" };

export default function StocktakePage(props: PageProps<"/stocktake/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <BackLink href="/stocktake">All stocktakes</BackLink>
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white font-semibold text-icci-green! transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50 disabled:opacity-60 px-4";

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/stocktake/[id]">["params"];
  searchParams: PageProps<"/stocktake/[id]">["searchParams"];
}) {
  const id = parseStocktakeId((await params).id);
  if (!id) notFound();
  const query = await searchParams;
  const me = await requireAdmin();
  const supabase = await createClient();
  const st = await loadStocktake(supabase, id);
  if (!st) notFound();

  const [lookups, nameOf, scans, cookieStore] = await Promise.all([
    loadLookups(supabase),
    adminNames(supabase),
    loadScans(supabase, id),
    cookies(),
  ]);
  const room = lookups.locationName.get(st.location_id) ?? "";
  const status = STOCKTAKE_STATUS[st.status];
  const scanningHere = parseStocktakeId(cookieStore.get(SCANNING_COOKIE)?.value) === id;

  return (
    <>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <h1 className="page-title text-[28px] md:text-[34px]">Stocktake: {room.split(" › ").at(-1)}</h1>
        <StatusBadge word={status.word} tone={status.tone} />
      </div>
      <p className="text-sm">
        {room} · stocktake {st.id} · started {formatDateTime(st.created_at)} by {nameOf(st.created_by)}
        {st.submitted_at && ` · sent ${formatDateTime(st.submitted_at)} by ${nameOf(st.submitted_by)}`}
      </p>

      {query.saved && typeof query.saved === "string" && (
        // The last scan, confirmed in a card that is easy to see at arm's length (UI-7).
        <p
          role="status"
          data-testid="last-scan"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-4 text-[17px]"
        >
          <CircleCheck aria-hidden size={28} className="shrink-0 text-[var(--icci-ok-text)]" />
          <span>
            <span className="font-bold text-[var(--icci-ok-text)]">Saved: {query.saved}.</span> Scan the next label.
          </span>
        </p>
      )}
      {query.done === "sent" && <PageNotice>Sent for approval. A different admin now approves or rejects each difference.</PageNotice>}
      {query.done === "approved" && <PageNotice>Difference approved. The item has been updated.</PageNotice>}
      {query.done === "rejected" && <PageNotice>Difference rejected. Nothing was changed.</PageNotice>}

      {st.status === "open" ? (
        await openSection({ id, scanningHere, scans: scans.latest })
      ) : (
        await sentSection({ id, meId: me.id, took: [st.created_by, st.submitted_by, ...scans.all.map((s) => s.created_by)] })
      )}
    </>
  );

  async function openSection(props: { id: number; scanningHere: boolean; scans: typeof scans.latest }) {
    const items = await loadItems(supabase, props.scans.map((s) => s.item_id!).filter(Boolean));
    // D4: the fixed assets the records say are in this room, and which of
    // them have not been scanned yet, so the admin can look for them before
    // leaving. Approval still works out the real differences.
    const { data: expectedData } = await supabase
      .from("items")
      .select("id, name, label_serial, location_id")
      .eq("kind", "fixed_asset")
      .in("location_id", locationAndInside(st!.location_id, lookups.locations))
      .or("condition.is.null,condition.not.in.(disposed,missing)")
      .order("name");
    const expected = (expectedData ?? []) as { id: string; name: string; label_serial: string; location_id: string }[];
    const seen = new Set(props.scans.map((s) => s.item_id));
    const stillToFind = expected.filter((e) => !seen.has(e.id));
    const found = expected.length - stillToFind.length;
    return (
      <>
        <section className="mt-4 space-y-3 rounded-2xl border border-icci-line bg-white shadow-card p-5">
          <h2 className="text-lg font-semibold">Scan each label in the room</h2>
          {props.scanningHere ? (
            <p data-testid="scanning-on">
              Use your phone&apos;s camera. Each label you scan opens here, ready to record. Shelves inside the room&apos;s
              store rooms are included.
            </p>
          ) : (
            <p data-testid="scanning-off">
              Labels you scan with the camera are opening their item as normal. Press <strong>Carry on scanning</strong>{" "}
              to bring them back to this stocktake.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {props.scanningHere ? (
              <form action={stopScanning.bind(null, props.id)}>
                <button type="submit" className={secondary}>
                  Stop scanning
                </button>
              </form>
            ) : (
              <form action={carryOn.bind(null, props.id)}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900"
                >
                  Carry on scanning
                </button>
              </form>
            )}
          </div>
          <StocktakeCamera stocktakeId={props.id} />
          <LabelBox stocktakeId={props.id} />
        </section>

        {expected.length > 0 && (
          <section className="mt-6 rounded-2xl border border-icci-line bg-white p-4 shadow-card md:p-5" aria-labelledby="progress-title" data-testid="stocktake-progress">
            <h2 id="progress-title" className="flex flex-wrap items-baseline justify-between gap-2 text-lg font-semibold">
              <span>
                {found} of {expected.length} expected assets found
              </span>
              {stillToFind.length === 0 && <StatusBadge word="All found" tone="green" />}
            </h2>
            <div
              className="mt-3 h-2.5 overflow-hidden rounded-full bg-icci-panel"
              role="progressbar"
              aria-label="Expected assets found"
              aria-valuemin={0}
              aria-valuemax={expected.length}
              aria-valuenow={found}
            >
              <div className="h-full rounded-full bg-icci-green transition-[width] duration-300" style={{ width: `${Math.round((found / expected.length) * 100)}%` }} />
            </div>
            {stillToFind.length > 0 && (
              <details className="group mt-3" data-testid="still-to-find">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-icci-green [&::-webkit-details-marker]:hidden">
                  Still to find ({stillToFind.length})
                </summary>
                <ul dir="auto" className="mt-1 divide-y divide-icci-line">
                  {stillToFind.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <span dir="auto" className="font-semibold">{e.name}</span>
                      <span className="text-sm text-icci-ink-60">
                        <span className="font-mono">{e.label_serial}</span> · {(lookups.locationName.get(e.location_id) ?? "").replace(`${room} › `, "")}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-lg font-semibold">Scanned so far</h2>
          <p data-testid="scan-count">
            {props.scans.length === 0
              ? "Nothing scanned yet."
              : `${props.scans.length} label${props.scans.length === 1 ? "" : "s"} scanned.`}
          </p>
          <ul dir="auto" className="mt-2 divide-y divide-icci-line rounded-2xl border border-icci-line bg-white shadow-card">
            {props.scans.map((s) => {
              const item = s.item_id ? items.get(s.item_id) : null;
              return (
                <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2" data-testid="scanned">
                  <span>
                    <span className="block font-semibold">{item ? item.name : "Unknown label: no item on it"}</span>
                    <span className="block text-sm">
                      {s.label_serial}
                      {item ? ` · ${lookups.locationName.get(item.location_id)}` : ""}
                    </span>
                  </span>
                  <span>
                    {item?.kind === "consumable" ? quantityWord(s.found_quantity ?? 0, item.unit ?? "") : item ? "Seen" : "Noted"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* E4: a plain row at the end, not stuck to the screen: stuck, it covered "Or type a label number". */}
        <div className="mt-6 border-t-2 border-icci-gold pt-3">
          <PrimaryLink href={`/stocktake/${props.id}/finish`}>Check and finish</PrimaryLink>
          <p className="mt-1 text-sm">Shows what is missing before anything is sent. You can come back and keep scanning.</p>
        </div>
      </>
    );
  }

  async function sentSection(props: { id: number; meId: string; took: (string | null)[] }) {
    const { data } = await supabase
      .from("stocktake_differences")
      .select(
        "id, item_id, kind, expected_location_id, expected_quantity, found_quantity, status, decided_by, decided_at, decision_note, found_condition",
      )
      .eq("stocktake_id", props.id)
      .order("id");
    const diffs = (data ?? []) as Difference[];
    const items = await loadItems(supabase, diffs.map((d) => d.item_id));
    const tookPart = props.took.includes(props.meId);
    const unknown = scans.latest.filter((s) => !s.item_id);

    return (
      <>
        <p className="mt-4" data-testid="difference-count">
          {diffs.length === 0
            ? "No differences: everything expected was found and every shelf matched."
            : `${diffs.length} difference${diffs.length === 1 ? "" : "s"}. Each one is approved or rejected on its own.`}
        </p>
        {tookPart && diffs.some((d) => d.status === "pending") && (
          <p className="mt-3 rounded-xl bg-icci-green-50 px-4 py-3" data-testid="took-part">
            You took part in this stocktake, so a different admin must decide on its differences.
          </p>
        )}
        <ul dir="auto" className="mt-3 space-y-3">
          {diffs.map((d) => {
            const item = items.get(d.item_id);
            const s = DIFFERENCE_STATUS[d.status];
            return (
              <li
                key={d.id}
                id={`difference-${d.id}`}
                className="rounded-2xl border border-icci-line bg-white shadow-card p-5"
                data-testid="difference"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p>
                    <span className="block text-sm font-semibold text-icci-green">
                      {DIFFERENCE_TITLE[d.kind]}
                    </span>
                    <Link dir="auto" href={`/items/${d.item_id}`} className="font-semibold">
                      {item?.name}
                    </Link>
                    <span className="block text-sm">{item?.label_serial}</span>
                  </p>
                  <StatusBadge word={s.word} tone={s.tone} />
                </div>
                <p dir="auto" className="mt-2">
                  {d.kind === "quantity"
                    ? describeQuantity(d.expected_quantity, d.found_quantity ?? 0, item?.unit ?? "")
                    : describeAssetDifference(d.kind, lookups.locationName.get(d.expected_location_id ?? "") ?? "")}
                </p>
                {d.status === "pending" ? (
                  <>
                    <p className="text-sm">{DIFFERENCE_EFFECT[d.kind]}</p>
                    {!tookPart && (
                      <DecideDifferenceForm stocktakeId={props.id} differenceId={d.id} askCondition={d.kind === "found"} />
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-sm">
                    {s.word} by {nameOf(d.decided_by)} · {d.decided_at ? formatDateTime(d.decided_at) : ""}
                    {d.found_condition && ` · back in use as ${d.found_condition === "good" ? "Good" : "Fair"}`}
                    {d.decision_note && (
                      <>
                        {" "}
                        · <span className="font-semibold">Note:</span> {d.decision_note}
                      </>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {unknown.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Unknown labels found</h2>
            <p>These labels have no item on them. Scan one to register its item.</p>
            <ul className="mt-2 list-inside list-disc">
              {unknown.map((s) => (
                <li key={s.id}>
                  <Link href={`/items/new?label=${s.label_serial}`}>{s.label_serial}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }
}
