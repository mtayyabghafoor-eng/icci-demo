import type { Metadata } from "next";
import { Suspense } from "react";
import { QuantityForm } from "../../../stock/forms";
import { loadConsumable, StockHeader } from "../../../stock/item-page";
import { Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Add stock | ICCI Control Dashboard" };

export default function RestockPage(props: PageProps<"/items/[id]/restock">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/items/[id]/restock">["params"] }) {
  const { id } = await params;
  const { level, place } = await loadConsumable(id);
  return (
    <>
      <StockHeader level={level} place={place} title="Add stock" />
      <QuantityForm itemId={level.item_id} kind="restock" unit={level.unit} />
    </>
  );
}
