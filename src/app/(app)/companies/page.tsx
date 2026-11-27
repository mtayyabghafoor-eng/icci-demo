// Companies (slice P1.19): suppliers, installers, service and repair firms
// and makers, with the number to ring. Super Admins and Centre Admins add,
// change and switch them off; nothing is ever deleted.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building, Plus } from "lucide-react";
import { DataTable, EmptyState, fieldClass, LinkButton, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { COMPANY_KINDS, kindWords, telLink, type CompanyRow } from "@/lib/companies/rules";
import { createClient } from "@/lib/supabase/server";
import { MAY_SEE_CATEGORIES } from "../categories/data";
import { allCompanies } from "./data";

export const metadata: Metadata = { title: "Companies | ICCI Control Dashboard" };

export default function CompaniesPage(props: PageProps<"/companies">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/companies">["searchParams"] }) {
  const me = await requireAdmin();
  const params = await searchParams;
  const allowed = MAY_SEE_CATEGORIES.includes(me.roleCode);
  const header = (
    <PageHeader
      title="Companies"
      subtitle="Who supplies, installs, services and makes what the Centre owns, and the number to ring."
      actions={
        allowed ? (
          <>
            <LinkButton href="/models" kind="outline">
              Makes and models
            </LinkButton>
            <LinkButton href="/companies/new" icon={Plus}>
              Add a company
            </LinkButton>
          </>
        ) : undefined
      }
    />
  );
  if (!allowed) {
    return (
      <>
        {header}
        <p data-testid="companies-not-allowed">Your account cannot see companies. Only a Super Admin or Centre Admin can.</p>
      </>
    );
  }
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const kind = typeof params.kind === "string" && params.kind in COMPANY_KINDS ? params.kind : "";
  const showOff = params.off === "1";
  const all = await allCompanies(await createClient());
  const shown = all.filter(
    (c) => (showOff || c.active) && (!q || c.name.toLowerCase().includes(q)) && (!kind || c.kinds.includes(kind as never)),
  );
  return (
    <>
      {header}
      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]" role="search" aria-label="Find a company">
        <label>
          <span className="font-semibold">Name</span>
          <input dir="auto" name="q" defaultValue={q} className={fieldClass} />
        </label>
        <label>
          <span className="font-semibold">What they do</span>
          <select name="kind" defaultValue={kind} className={fieldClass}>
            <option value="">Anything</option>
            {Object.entries(COMPANY_KINDS).map(([k, w]) => (
              <option key={k} value={k}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="inline-flex min-h-11 items-center rounded-[10px] bg-icci-green-dark px-4 font-semibold text-white!">
            Search
          </button>
        </div>
      </form>
      <p className="mb-3 text-sm">
        <Link href={showOff ? "/companies" : "/companies?off=1"}>{showOff ? "Hide switched-off companies" : "Show switched-off companies too"}</Link>
      </p>
      {shown.length === 0 ? (
        <EmptyState icon={Building} title="No companies found">
          Add the companies that supply and service the Centre&apos;s things.
        </EmptyState>
      ) : (
        <DataTable<CompanyRow>
          caption="Companies"
          rows={shown}
          rowKey={(c) => c.id}
          columns={[
            {
              key: "name",
              header: "Company",
              cell: (c) => (
                <span>
                  <Link dir="auto" href={`/companies/${c.id}`} className="font-semibold">
                    {c.name}
                  </Link>{" "}
                  {!c.active && <StatusBadge word="Switched off" tone="grey" />}
                </span>
              ),
            },
            { key: "kinds", header: "What they do", cell: (c) => kindWords(c.kinds) },
            { key: "phone", header: "Phone", cell: (c) => (c.phone ? <a href={telLink(c.phone)}>{c.phone}</a> : "None recorded") },
          ]}
        />
      )}
    </>
  );
}
