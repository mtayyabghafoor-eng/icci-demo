// One scanned label during a stocktake (phone-first).
//   Asset          → "Seen here" (one tap)
//   Shelf          → "How many are on the shelf?"
//   Label, no item → "Note this label" (unknown label found)
// The database checks everything again when the scan is saved.
import { titleCase } from "@/lib/ui/text";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { locationAndInside, parseLabelNumber } from "@/lib/items/rules";
import { parseStocktakeId } from "@/lib/stocktake/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups } from "../../../items/data";
import { stockLevelOf } from "../../../stock/data";
import { ITEM_BRIEF, type ItemBrief, loadStocktake } from "../../data";
import { ScanForm } from "../../forms";
import { BackLink, ItemStatus, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Stocktake scan | ICCI Control Dashboard" };

export default function ScanPage(props: PageProps<"/stocktake/[id]/scan">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/stocktake/[id]/scan">["params"];
  searchParams: PageProps<"/stocktake/[id]/scan">["searchParams"];
}) {
  const id = parseStocktakeId((await params).id);
  if (!id) notFound();
  const { label } = await searchParams;
  const serial = parseLabelNumber(typeof label === "string" ? label : "");
  const supabase = await createClient();
  const st = await loadStocktake(supabase, id);
  if (!st) notFound();
  const lookups = await loadLookups(supabase);
  const roomPath = lookups.locationName.get(st.location_id) ?? "";
  const back = (
    <BackLink href={`/stocktake/${id}`}>Stocktake: {roomPath.split(" › ").at(-1)}</BackLink>
  );

  const problem = (title: string, text: React.ReactNode) => (
    <>
      {back}
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">{titleCase(title)}</h1>
      <p className="mt-3 rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3" role="alert">
        {text}
      </p>
    </>
  );

  if (st.status !== "open") return problem("Stocktake already sent", "This stocktake has been sent for approval. It cannot take more scans.");
  if (!serial) return problem("Not a label", "That is not an ICCI label number.");

  const { data: labelRow } = await supabase.from("labels").select("serial").eq("serial", serial).maybeSingle();
  if (!labelRow) return problem("Label not recognised", `${serial} is not an ICCI label.`);

  const { data } = await supabase.from("items").select(ITEM_BRIEF).eq("label_serial", serial).maybeSingle();
  const item = data as ItemBrief | null;
  const level = item?.kind === "consumable" ? await stockLevelOf(supabase, item.id) : null;
  const inRoom = item ? locationAndInside(st.location_id, lookups.locations).includes(item.location_id) : false;

  return (
    <>
      {back}
      <p className="mt-2 text-sm font-semibold">{serial}</p>
      <h1 className="page-title text-[28px] md:text-[34px]" data-testid="scan-title">
        {item ? item.name : "Unknown label"}
      </h1>
      {item ? (
        <>
          <p className="mt-1">
            <ItemStatus kind={item.kind} condition={item.condition} stock={level?.status} />
          </p>
          <p className="mt-2">Recorded at {lookups.locationName.get(item.location_id)}</p>
          {item.kind === "fixed_asset" && !inRoom && (
            <p className="mt-2 rounded-xl border border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)] px-4 py-3" data-testid="not-this-room">
              This asset is recorded in another place. If you press Seen here, the stocktake will list it as{" "}
              <strong>found here</strong>, and a different admin decides whether to move it.
            </p>
          )}
          {item.condition === "missing" && (
            <p className="mt-2 rounded-xl border border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)] px-4 py-3">
              This asset is marked missing. Press <strong>Seen here</strong>: when a different admin approves the
              stocktake, it is put back in use. Do not mark it found yourself in the meantime.
            </p>
          )}
          {item.kind === "consumable" && !inRoom ? (
            <p className="mt-3 rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3" role="alert">
              This shelf belongs to another room. Consumables are not moved: count it in its own room.
            </p>
          ) : item.condition === "disposed" ? (
            <p className="mt-3 rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3" role="alert">
              This asset has been disposed of. It should not be here: tell the Centre Admin.
            </p>
          ) : (
            <ScanForm stocktakeId={id} serial={serial} kind={item.kind} unit={item.unit ?? ""} />
          )}
          <p className="mt-4 text-sm">
            <Link href={`/items/${item.id}`}>Open the item instead</Link>
          </p>
        </>
      ) : (
        <>
          <p className="mt-2">This label has not been put on an item yet. Note it now, and register the item after the stocktake.</p>
          <ScanForm stocktakeId={id} serial={serial} kind="unknown" />
        </>
      )}
    </>
  );
}
