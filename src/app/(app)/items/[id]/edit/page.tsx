import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { categoryGroups } from "@/lib/categories/rules";
import { KIND_LABEL } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { allCompanies, allModels, companyChoices, modelChoices } from "../../../companies/data";
import { ITEM_COLUMNS, loadLookups, type ItemRow } from "../../data";
import { EditForm } from "./edit-form";
import { BackLink } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Edit item | ICCI Control Dashboard" };

export default function EditItemPage(props: PageProps<"/items/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading item…</p>}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/items/[id]/edit">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const item = data as ItemRow;
  const [{ categories, locationName }, companies, models] = await Promise.all([loadLookups(supabase), allCompanies(supabase), allModels(supabase)]);

  return (
    <>
      <BackLink href={`/items/${id}`}>Back to the item</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Edit Details</h1>
      <p className="mt-2">
        {KIND_LABEL[item.kind]} · label {item.label_serial} · {locationName.get(item.location_id)}
      </p>
      <p className="mt-1 text-sm">
        The kind and label cannot be changed. Moving the item and changing its condition come in a later step. The old
        details stay in the history.
      </p>
      <EditForm
        item={item}
        categoryGroups={categoryGroups(categories, { pickable: true, keep: item.category_id })}
        models={modelChoices(models, companies, item.model_id)}
        companies={companyChoices(companies, item.supplier_company_id, item.service_company_id)}
      />
    </>
  );
}
