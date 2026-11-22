// Change a company's details (slice P1.19). The old details stay in the audit log.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { COMPANY_COLUMNS, type CompanyRow } from "@/lib/companies/rules";
import { UUID } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { MAY_SEE_CATEGORIES } from "../../../categories/data";
import { CompanyForm } from "../../forms";

export const metadata: Metadata = { title: "Change a company | ICCI Control Dashboard" };

async function Content(props: PageProps<"/companies/[id]/edit">) {
  const me = await requireAdmin();
  const { id } = await props.params;
  if (!MAY_SEE_CATEGORIES.includes(me.roleCode) || !UUID.test(id)) notFound();
  const { data } = await (await createClient()).from("companies").select(COMPANY_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const company = data as CompanyRow;
  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/companies", label: "Companies" },
          { href: `/companies/${id}`, label: company.name },
        ]}
        title="Change This Company"
      />
      <CompanyForm company={company} cancelHref={`/companies/${id}`} />
    </>
  );
}

export default function Page(props: PageProps<"/companies/[id]/edit">) {
  return (
    <PageShell width="narrow">
      <Content {...props} />
    </PageShell>
  );
}
