// Add a company (slice P1.19).
import type { Metadata } from "next";
import { PageHeader, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_CATEGORIES } from "../../categories/data";
import { CompanyForm } from "../forms";

export const metadata: Metadata = { title: "Add a company | ICCI Control Dashboard" };

async function Content() {
  const me = await requireAdmin();
  return (
    <>
      <PageHeader crumbs={[{ href: "/companies", label: "Companies" }]} title="Add a Company" />
      {MAY_SEE_CATEGORIES.includes(me.roleCode) ? (
        <CompanyForm cancelHref="/companies" />
      ) : (
        <p data-testid="companies-not-allowed">Your account cannot add companies. Only a Super Admin or Centre Admin can.</p>
      )}
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
