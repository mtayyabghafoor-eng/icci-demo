// The staff call sheet (P1.21, owner's choice 21 Nov 2026): staff and
// volunteers cannot log in, so a printed A4 sheet for the staff room or the
// shed says who to phone when something breaks, category by category: the
// contact person (from the People list) and the usual service company. A
// sub-category with its own contact or company is listed under its main
// category. Optionally headed with the building it is posted in.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { categoryGroups, type CategoryRow } from "@/lib/categories/rules";
import { contactPerson, type CompanyRow } from "@/lib/companies/rules";
import { UUID } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { allCompanies } from "../../companies/data";
import { loadLookups } from "../../items/data";
import { personNames } from "../../tickets/data";
import { allCategories, MAY_SEE_CATEGORIES } from "../data";
import { CategoryIcon } from "../category-icon";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Call sheet | ICCI Control Dashboard" };

// A6: the person is kept by their record, not their name, so two contacts
// with the same name each show their own phone number.
type Who = { person: { name: string; phone: string } | null; company: CompanyRow | undefined };

function WhoLine({ who }: { who: Who }) {
  const parts: string[] = [];
  if (who.person) parts.push(`${who.person.name}${who.person.phone ? `, ${who.person.phone}` : ""}`);
  if (who.company) parts.push(`${who.company.name}${who.company.phone ? `, ${who.company.phone}` : ""}`);
  return <>{parts.length ? parts.join(" · then ") : "Phone the office"}</>;
}

async function Content({ searchParams }: PageProps<"/categories/call-sheet">) {
  const me = await requireAdmin();
  if (!MAY_SEE_CATEGORIES.includes(me.roleCode)) notFound();
  const place = (await searchParams).place;
  const supabase = await createClient();
  const [all, companies, lookups] = await Promise.all([allCategories(supabase), allCompanies(supabase), loadLookups(supabase)]);
  const company = new Map(companies.map((c) => [c.id, c]));
  const ids = all.map((c) => c.contact_person_id ?? null);
  const names = await personNames(supabase, ids);
  const { data: phoneRows } = await supabase.from("people").select("id, phone").in("id", [...names.keys()]);
  const phoneOf = new Map(((phoneRows ?? []) as { id: string; phone: string | null }[]).map((p) => [p.id, p.phone ?? ""]));
  const who = (sub: CategoryRow | null, main: CategoryRow): Who => {
    const person = contactPerson(sub, main);
    const companyId = sub?.service_company_id ?? main.service_company_id;
    const name = person ? names.get(person) : undefined;
    return { person: person && name ? { name, phone: phoneOf.get(person) ?? "" } : null, company: companyId ? company.get(companyId) : undefined };
  };
  const placeName = typeof place === "string" && UUID.test(place) ? lookups.locationName.get(place) : undefined;
  const groups = categoryGroups(all);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm">Print this sheet and put it up where staff will see it. It lists no item details, only who to phone.</p>
        <PrintButton />
      </div>
      <article className="call-sheet-page rounded-2xl border border-icci-line bg-white p-6 shadow-card print:border-0 print:p-0 print:shadow-none" data-testid="call-sheet">
        <h1 className="page-title text-[28px]">If Something Breaks, Phone…</h1>
        <p className="mt-1 text-icci-ink-60">
          Islamic Cultural Centre of Ireland{placeName ? ` · ${placeName}` : ""}. Tell them what it is and its label number (ICCI-…).
        </p>
        <table className="mt-5 w-full border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-b-2 border-icci-green-dark">
              <th scope="col" className="py-2 pr-3">
                What has broken
              </th>
              <th scope="col" className="py-2">
                Who to phone
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ main, subs }) => {
              const own = subs.filter((s) => s.contact_person_id || s.service_company_id);
              return [
                <tr key={main.id} className="border-b border-icci-line align-top" data-testid="call-row">
                  <th scope="row" className="py-2.5 pr-3 font-semibold">
                    <span className="flex items-center gap-2">
                      <CategoryIcon icon={main.icon} size={18} />
                      {main.name}
                    </span>
                  </th>
                  <td className="py-2.5">
                    <WhoLine who={who(null, main)} />
                  </td>
                </tr>,
                ...own.map((s) => (
                  <tr key={s.id} className="border-b border-icci-line align-top text-[14px]" data-testid="call-row">
                    <th dir="auto" scope="row" className="py-2 pl-7 pr-3 font-normal">
                      {s.name}
                    </th>
                    <td className="py-2">
                      <WhoLine who={who(s, main)} />
                    </td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
        <p className="mt-5 text-sm text-icci-ink-60">An emergency (fire, flood, injury): phone 112 or 999 first.</p>
      </article>
    </>
  );
}

export default function Page(props: PageProps<"/categories/call-sheet">) {
  return (
    <PageShell>
      <Content {...props} />
    </PageShell>
  );
}
