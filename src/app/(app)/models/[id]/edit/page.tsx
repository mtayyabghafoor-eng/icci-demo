// Change a make and model (slice P1.19). The old details stay in the audit log.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { categoryGroups } from "@/lib/categories/rules";
import { UUID } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { allCategories, MAY_SEE_CATEGORIES } from "../../../categories/data";
import { allCompanies, allModels, companyChoices } from "../../../companies/data";
import { ModelForm } from "../../../companies/forms";

export const metadata: Metadata = { title: "Change a make and model | ICCI Control Dashboard" };

async function Content(props: PageProps<"/models/[id]/edit">) {
  const me = await requireAdmin();
  const { id } = await props.params;
  if (!MAY_SEE_CATEGORIES.includes(me.roleCode) || !UUID.test(id)) notFound();
  const supabase = await createClient();
  const [models, companies, categories] = await Promise.all([allModels(supabase), allCompanies(supabase), allCategories(supabase)]);
  const model = models.find((m) => m.id === id);
  if (!model) notFound();
  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/models", label: "Makes and models" },
          { href: `/models/${id}`, label: model.model_name },
        ]}
        title="Change This Make and Model"
      />
      <ModelForm
        model={model}
        makers={companyChoices(companies, model.maker_company_id)}
        services={companyChoices(companies, model.service_company_id)}
        categoryGroups={categoryGroups(categories, { pickable: true, keep: model.category_id })}
        cancelHref={`/models/${id}`}
      />
    </>
  );
}

export default function Page(props: PageProps<"/models/[id]/edit">) {
  return (
    <PageShell width="narrow">
      <Content {...props} />
    </PageShell>
  );
}
