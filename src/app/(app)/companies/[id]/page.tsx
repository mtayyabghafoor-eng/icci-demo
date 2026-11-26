// One company (slice P1.19): what they do, how to reach them, the makes and
// models they make or service, the categories they usually service, and the
// items they supplied or service. Change, or switch off (never deleted).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pencil } from "lucide-react";
import { Card, CardTitle, FactGrid, LinkButton, PageHeader, PageNotice, Skeleton, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { categoryPath } from "@/lib/categories/rules";
import { kindWords, telLink } from "@/lib/companies/rules";
import { UUID } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { allCategories, MAY_SEE_CATEGORIES } from "../../categories/data";
import { companyFilter } from "../../items/search";
import { allCompanies, allModels, DONE } from "../data";
import { SwitchActive } from "../forms";

export const metadata: Metadata = { title: "Company | ICCI Control Dashboard" };

export default function CompanyPage(props: PageProps<"/companies/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: { params: PageProps<"/companies/[id]">["params"]; searchParams: PageProps<"/companies/[id]">["searchParams"] }) {
  const me = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!MAY_SEE_CATEGORIES.includes(me.roleCode) || !UUID.test(id)) notFound();
  const supabase = await createClient();
  const [companies, models, categories, items] = await Promise.all([
    allCompanies(supabase),
    allModels(supabase),
    allCategories(supabase),
    supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .or(await companyFilter(supabase, id))
      .or("condition.is.null,condition.neq.disposed"),
  ]);
  const company = companies.find((c) => c.id === id);
  if (!company) notFound();
  const theirModels = models.filter((m) => m.maker_company_id === id || m.service_company_id === id);
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const theirCategories = categories.filter((c) => c.service_company_id === id);
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/companies", label: "Companies" }]}
        title={company.name}
        subtitle={kindWords(company.kinds)}
        status={!company.active ? <StatusBadge word="Switched off" tone="grey" /> : undefined}
        actions={
          <LinkButton href={`/companies/${id}/edit`} icon={Pencil} kind="outline">
            Change
          </LinkButton>
        }
      />
      {done && <PageNotice floating>{done}</PageNotice>}
      <div className="mt-4 space-y-4">
        <Card>
          <FactGrid
            facts={[
              { label: "Phone", value: company.phone ? <a href={telLink(company.phone)} data-testid="company-phone">{company.phone}</a> : "None recorded" },
              { label: "Email", value: company.email ? <a href={`mailto:${company.email}`}>{company.email}</a> : "None recorded" },
              {
                label: "Website",
                value: company.website ? (
                  <a href={company.website} target="_blank" rel="noopener noreferrer">
                    {company.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  "None recorded"
                ),
              },
              { label: "Notes", value: <span className="whitespace-pre-line">{company.notes || "None"}</span> },
            ]}
          />
        </Card>

        <Card>
          <CardTitle>What they look after</CardTitle>
          <p data-testid="company-items">
            {(items.count ?? 0) === 0 ? (
              "No items name this company as maker, supplier or service company."
            ) : (
              <>
                {items.count} item{items.count === 1 ? "" : "s"} name this company as maker, supplier or service company.{" "}
                <Link href={`/items?company=${id}`}>See them</Link>
              </>
            )}
          </p>
          {theirCategories.length > 0 && (
            <p className="mt-2">
              Usual service company for: {theirCategories.map((c) => categoryPath(c.id, catMap)).join("; ")}.
            </p>
          )}
          {theirModels.length > 0 && (
            <ul className="mt-3 divide-y divide-icci-line" data-testid="company-models">
              {theirModels.map((m) => (
                <li key={m.id} className="py-2">
                  <Link href={`/models/${m.id}`} className="font-semibold">
                    {m.model_name}
                  </Link>{" "}
                  <span className="text-sm text-icci-ink-60">
                    · {m.maker_company_id === id ? "they make it" : "they service it"} · {categoryPath(m.category_id, catMap)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>{company.active ? "Switch off" : "Switched off"}</CardTitle>
          <SwitchActive table="companies" id={id} active={company.active} what="company" />
        </Card>
      </div>
    </>
  );
}
