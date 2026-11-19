import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatDateTime } from "@/lib/items/rules";
import { MOVEMENT_LABEL } from "@/lib/stock/rules";
import { adminNames, MOVEMENT_COLUMNS, type Movement } from "../../../stock/data";
import { CorrectionForm } from "../../../stock/forms";
import { loadConsumable, StockHeader } from "../../../stock/item-page";

export const metadata: Metadata = { title: "Correct an entry | ICCI Control Dashboard" };

export default function CorrectPage(props: PageProps<"/items/[id]/correct">) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading entry…</p>}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content(props: {
  params: PageProps<"/items/[id]/correct">["params"];
  searchParams: PageProps<"/items/[id]/correct">["searchParams"];
}) {
  const { id } = await props.params;
  const { entry: raw } = await props.searchParams;
  const entryId = typeof raw === "string" && /^\d{1,15}$/.test(raw) ? Number(raw) : null;
  if (!entryId) notFound();

  const { supabase, level, place } = await loadConsumable(id);
  const { data } = await supabase.from("stock_movements").select(MOVEMENT_COLUMNS).eq("id", entryId).eq("item_id", id).maybeSingle();
  const entry = data as Movement | null;
  if (!entry || entry.kind === "adjustment") notFound();
  const nameOf = await adminNames(supabase);

  return (
    <>
      <StockHeader level={level} place={place} title="Correct an entry" />
      <section className="mt-4 rounded-2xl border border-icci-gold-300 bg-icci-gold-100 p-4" aria-label="The entry being corrected">
        <p className="font-semibold">
          {MOVEMENT_LABEL[entry.kind]}: {entry.quantity} {level.unit}
        </p>
        <p className="text-sm">
          {formatDateTime(entry.created_at)} · {nameOf(entry.created_by)}
        </p>
      </section>
      <p className="mt-3">
        The original entry stays in the history. Your correction counts only once a <strong>different admin</strong> approves it.
      </p>
      <CorrectionForm itemId={id} entryId={entry.id} unit={level.unit} />
    </>
  );
}
