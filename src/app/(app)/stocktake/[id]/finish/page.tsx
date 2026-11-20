// Check and finish: what sending this stocktake would list, worked out by the
// database (stocktake_preview, the same rule that sending uses). Nothing is
// saved until "Send for approval".
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { locationAndInside } from "@/lib/items/rules";
import { DIFFERENCE_KINDS, DIFFERENCE_TITLE, describeQuantity, type DifferenceKind, parseStocktakeId } from "@/lib/stocktake/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups } from "../../../items/data";
import { loadItems, loadScans, loadStocktake } from "../../data";
import { SendForm } from "../../forms";
import { BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Check and finish | ICCI Control Dashboard" };

export default function FinishPage(props: PageProps<"/stocktake/[id]/finish">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Working out the differences…</p>}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

type Finding = {
  item_id: string;
  kind: DifferenceKind;
  expected_location_id: string | null;
  expected_quantity: number | null;
  found_quantity: number | null;
};

async function Content({ params }: { params: PageProps<"/stocktake/[id]/finish">["params"] }) {
  const id = parseStocktakeId((await params).id);
  if (!id) notFound();
  const supabase = await createClient();
  const st = await loadStocktake(supabase, id);
  if (!st) notFound();
  if (st.status !== "open") redirect(`/stocktake/${id}`);

  const [{ data, error }, lookups, scans] = await Promise.all([
    supabase.rpc("stocktake_preview", { p_stocktake_id: id }),
    loadLookups(supabase),
    loadScans(supabase, id),
  ]);
  const findings = (error ? [] : (data ?? [])) as Finding[];

  // Shelves in the room that were not scanned: listed only; nothing changes.
  const roomPath = lookups.locationName.get(st.location_id) ?? "";
  const scannedIds = new Set(scans.latest.map((s) => s.item_id).filter(Boolean));
  const { data: shelfData } = await supabase
    .from("items")
    .select("id")
    .eq("kind", "consumable")
    .in("location_id", locationAndInside(st.location_id, lookups.locations));
  const notCounted = ((shelfData ?? []) as { id: string }[]).filter((r) => !scannedIds.has(r.id));
  const items = await loadItems(supabase, [...findings.map((f) => f.item_id), ...notCounted.map((r) => r.id)]);
  const unknown = scans.latest.filter((s) => !s.item_id);
  const groups = DIFFERENCE_KINDS;

  return (
    <>
      <BackLink href={`/stocktake/${id}`}>Keep scanning</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Check and Finish</h1>
      <p className="mt-1">
        {roomPath} · {scans.latest.length} label{scans.latest.length === 1 ? "" : "s"} scanned. Nothing has been sent yet.
      </p>
      {error && (
        <p className="mt-3 rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3" role="alert">
          The differences could not be worked out. Please try again.
        </p>
      )}

      {groups.map((kind) => {
        const list = findings.filter((f) => f.kind === kind);
        return (
          <section key={kind} className="mt-6" data-testid={`group-${kind}`}>
            <h2 className="text-lg font-semibold">
              {DIFFERENCE_TITLE[kind]} ({list.length})
            </h2>
            {list.length === 0 ? (
              <p className="text-sm">None.</p>
            ) : (
              <ul className="mt-2 divide-y divide-icci-line rounded-2xl border border-icci-line bg-white shadow-card">
                {list.map((f) => {
                  const item = items.get(f.item_id);
                  return (
                    <li key={f.item_id} className="px-3 py-2" data-testid="finding">
                      <span className="block font-semibold">{item?.name}</span>
                      <span className="block text-sm">
                        {item?.label_serial} ·{" "}
                        {kind === "quantity"
                          ? describeQuantity(f.expected_quantity, f.found_quantity ?? 0, item?.unit ?? "")
                          : `${kind === "found" ? "marked missing, " : ""}recorded at ${lookups.locationName.get(f.expected_location_id ?? "")}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {notCounted.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Shelves not counted ({notCounted.length})</h2>
          <p className="text-sm">Not part of the differences: their stock stays as it is.</p>
          <ul className="mt-2 list-inside list-disc text-sm">
            {notCounted.map((r) => (
              <li key={r.id}>
                {items.get(r.id)?.name} ({items.get(r.id)?.label_serial})
              </li>
            ))}
          </ul>
        </section>
      )}
      {unknown.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Unknown labels found ({unknown.length})</h2>
          <p className="text-sm">{unknown.map((s) => s.label_serial).join(", ")}. Register their items afterwards.</p>
        </section>
      )}

      <SendForm stocktakeId={id} differences={findings.length} />
    </>
  );
}
