// Add a make and model (slice P1.19).
import type { Metadata } from "next";
import { PageHeader, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { categoryGroups } from "@/lib/categories/rules";
import { createClient } from "@/lib/supabase/server";
import { allCategories, MAY_SEE_CATEGORIES } from "../../categories/data";
import { allCompanies, companyChoices } from "../../companies/data";
import { ModelForm } from "../../companies/forms";

export const metadata: Metadata = { title: "Add a make and model | ICCI Control Dashboard" };

async function Content() {
  const me = await requireAdmin();
  const header = <PageHeader crumbs={[{ href: "/models", label: "Makes and models" }]} title="Add a Make and Model" />;
  if (!MAY_SEE_CATEGORIES.includes(me.roleCode)) {
    return (
      <>
        {header}
        <p data-testid="companies-not-allowed">Your account cannot add makes and models. Only a Super Admin or Centre Admin can.</p>
      </>
    );
  }
  const supabase = await createClient();
  const [companies, categories] = await Promise.all([allCompanies(supabase), allCategories(supabase)]);
  const choices = companyChoices(companies);
  return (
    <>
      {header}
      <ModelForm
        makers={choices}
        services={choices}
        categoryGroups={categoryGroups(categories, { pickable: true })}
        cancelHref="/models"
      />
    </>
  );
}

export default function Page() {
  return (
    <PageShell width="narrow">
      <Content />
    </PageShell>
  );
}
