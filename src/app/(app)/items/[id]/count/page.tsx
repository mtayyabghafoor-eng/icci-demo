import type { Metadata } from "next";
import { Suspense } from "react";
import { QuantityForm } from "../../../stock/forms";
import { loadConsumable, StockHeader } from "../../../stock/item-page";
import { Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Count this shelf | ICCI Control Dashboard" };

export default function CountPage(props: PageProps<"/items/[id]/count">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/items/[id]/count">["params"] }) {
  const { id } = await params;
  const { level, place } = await loadConsumable(id);
  return (
    <>
      <StockHeader level={level} place={place} title="Count this shelf" />
      <QuantityForm itemId={level.item_id} kind="count" unit={level.unit} />
    </>
  );
}
