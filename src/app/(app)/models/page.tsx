// Makes and models (slice P1.19): each product recorded once, with its
// maker, category, service company and usual warranty. Its manuals are on
// its page (P1.20). Every unit of that model just picks it.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus, Tags } from "lucide-react";
import { DataTable, EmptyState, fieldClass, LinkButton, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { categoryPath } from "@/lib/categories/rules";
import type { ModelRow } from "@/lib/companies/rules";
import { createClient } from "@/lib/supabase/server";
import { allCategories, MAY_SEE_CATEGORIES } from "../categories/data";
import { allCompanies, allModels } from "../companies/data";

export const metadata: Metadata = { title: "Makes and models | ICCI Control Dashboard" };

export default function ModelsPage(props: PageProps<"/models">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/models">["searchParams"] }) {
  const me = await requireAdmin();
  const params = await searchParams;
  const allowed = MAY_SEE_CATEGORIES.includes(me.roleCode);
  const header = (
    <PageHeader
      crumbs={[{ href: "/companies", label: "Companies" }]}
      title="Makes and Models"
      subtitle="Each product recorded once, with its manuals and who services it."
      actions={allowed ? <LinkButton href="/models/new" icon={Plus}>Add a make and model</LinkButton> : undefined}
    />
  );
  if (!allowed) {
    return (
      <>
        {header}
        <p data-testid="companies-not-allowed">Your account cannot see makes and models. Only a Super Admin or Centre Admin can.</p>
      </>
    );
  }
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const supabase = await createClient();
  const [models, companies, categories] = await Promise.all([allModels(supabase), allCompanies(supabase), allCategories(supabase)]);
  const name = new Map(companies.map((c) => [c.id, c.name]));
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const shown = models.filter((m) => !q || `${name.get(m.maker_company_id) ?? ""} ${m.model_name}`.toLowerCase().includes(q));
  return (
    <>
      {header}
      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]" role="search" aria-label="Find a make and model">
        <label>
          <span className="font-semibold">Maker or model</span>
          <input dir="auto" name="q" defaultValue={q} className={fieldClass} />
        </label>
        <div className="flex items-end">
          <button type="submit" className="inline-flex min-h-11 items-center rounded-[10px] bg-icci-green-dark px-4 font-semibold text-white!">
            Search
          </button>
        </div>
      </form>
      {shown.length === 0 ? (
        <EmptyState icon={Tags} title="No makes and models found">
          Add a model once; every unit of it can then pick it.
        </EmptyState>
      ) : (
        <DataTable<ModelRow>
          caption="Makes and models"
          rows={shown}
          rowKey={(m) => m.id}
          columns={[
            {
              key: "model",
              header: "Model",
              cell: (m) => (
                <span>
                  <Link dir="auto" href={`/models/${m.id}`} className="font-semibold">
                    {m.model_name}
                  </Link>{" "}
                  {!m.active && <StatusBadge word="Switched off" tone="grey" />}
                </span>
              ),
            },
            { key: "maker", header: "Maker", cell: (m) => name.get(m.maker_company_id) ?? "" },
            { key: "category", header: "Category", cell: (m) => categoryPath(m.category_id, catMap), wideOnly: true },
            { key: "service", header: "Serviced by", cell: (m) => (m.service_company_id ? name.get(m.service_company_id) : "Not set"), wideOnly: true },
          ]}
        />
      )}
    </>
  );
}
