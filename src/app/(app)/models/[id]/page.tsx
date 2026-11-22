// One make and model (slice P1.19): its maker, category, service company and
// usual warranty, every unit the Centre has, and (P1.20) its manuals and
// other documents. Change, or switch off (never deleted).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Card, CardTitle, FactGrid, LinkButton, PageHeader, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { categoryPath } from "@/lib/categories/rules";
import { UUID } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { allCategories, MAY_SEE_CATEGORIES } from "../../categories/data";
import { allCompanies, allModels, DONE } from "../../companies/data";
import { SwitchActive } from "../../companies/forms";
import { DocumentsCard } from "../../documents/documents-card";
import { ItemStatus, Notice, StatusBadge } from "../../items/ui";

export const metadata: Metadata = { title: "Make and model | ICCI Control Dashboard" };

async function Content({ params, searchParams }: PageProps<"/models/[id]">) {
  const me = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!MAY_SEE_CATEGORIES.includes(me.roleCode) || !UUID.test(id)) notFound();
  const supabase = await createClient();
  const [models, companies, categories, units] = await Promise.all([
    allModels(supabase),
    allCompanies(supabase),
    allCategories(supabase),
    supabase.from("items").select("id, name, label_serial, kind, condition").eq("model_id", id).neq("condition", "disposed").order("name").limit(200),
  ]);
  const model = models.find((m) => m.id === id);
  if (!model) notFound();
  const company = new Map(companies.map((c) => [c.id, c]));
  const maker = company.get(model.maker_company_id);
  const service = model.service_company_id ? company.get(model.service_company_id) : undefined;
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;
  const list = (units.data ?? []) as { id: string; name: string; label_serial: string; kind: "fixed_asset"; condition: "good" }[];

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/models", label: "Makes and models" }]}
        title={model.model_name}
        subtitle={maker ? `Made by ${maker.name}` : undefined}
        status={!model.active ? <StatusBadge word="Switched off" tone="grey" /> : undefined}
        actions={
          <LinkButton href={`/models/${id}/edit`} icon={Pencil} kind="outline">
            Change
          </LinkButton>
        }
      />
      {done && <Notice floating>{done}</Notice>}
      <div className="mt-4 space-y-4">
        <Card>
          <FactGrid
            facts={[
              { label: "Maker", value: maker ? <Link href={`/companies/${maker.id}`}>{maker.name}</Link> : "Unknown" },
              { label: "Category", value: categoryPath(model.category_id, new Map(categories.map((c) => [c.id, c]))) },
              { label: "Serviced by", value: service ? <Link href={`/companies/${service.id}`}>{service.name}</Link> : "Not set" },
              { label: "Usual warranty", value: model.warranty_months ? `${model.warranty_months} months` : "Not recorded" },
              { label: "Notes", value: <span className="whitespace-pre-line">{model.notes || "None"}</span> },
            ]}
          />
        </Card>

        <DocumentsCard owner={{ model_id: id }} returnTo={`/models/${id}`} />

        <Card>
          <CardTitle>Units the Centre has</CardTitle>
          {list.length === 0 ? (
            <p className="text-icci-ink-60">No item has this model yet. Pick it on an item&apos;s &ldquo;Edit details&rdquo; page.</p>
          ) : (
            <ul className="divide-y divide-icci-line" data-testid="model-units">
              {list.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <Link href={`/items/${i.id}`} className="font-semibold">
                      {i.name}
                    </Link>{" "}
                    <span className="font-mono text-sm text-icci-ink-60">{i.label_serial}</span>
                  </span>
                  <ItemStatus kind={i.kind} condition={i.condition} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>{model.active ? "Switch off" : "Switched off"}</CardTitle>
          <SwitchActive table="product_models" id={id} active={model.active} what="make and model" />
        </Card>
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/models/[id]">) {
  return (
    <PageShell>
      <Content {...props} />
    </PageShell>
  );
}
