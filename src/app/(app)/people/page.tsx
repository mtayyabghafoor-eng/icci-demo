// The people directory (PLAN.md 5.2; slice P2.1): search, and filter by
// role, section, active and (P2.3) vetting status. Designed for a PC first; one card per person on
// a phone. Super Admin and Centre Admin only.
import { UserSearch } from "lucide-react";
import type { Metadata } from "next";
import { CannotSee, EmptyState, fieldClass, LinkButton, Pagination, PrimaryLink, Skeleton, StatusBadge } from "@/components/ui";
import { FilterFold } from "@/components/ui/filter-fold";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { cleanSearch, formatDate } from "@/lib/items/rules";
import { MAY_SEE_PEOPLE, PERSON_STATUS } from "@/lib/people/rules";
import { createClient } from "@/lib/supabase/server";
import { pageRows } from "@/lib/supabase/page-rows";
import { PAGE_SIZE, readPage } from "@/lib/ui/text";
import { VETTING_STATUS, type VettingStatus } from "@/lib/vetting/rules";
import { loadPeopleLists, PERSON_COLUMNS, type PersonRow } from "./data";

export const metadata: Metadata = { title: "People | ICCI Control Dashboard" };

export default function PeoplePage(props: PageProps<"/people">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]">People</h1>
      </div>
      <p className="mt-2">Staff, imams, volunteers and contractors. They are records here, not users: they cannot sign in.</p>
      <Suspense fallback={<Skeleton />}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

async function List({ searchParams }: { searchParams: PageProps<"/people">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_PEOPLE.includes(me.roleCode)) return <CannotSee area="people" />;

  const params = await searchParams;
  const q = cleanSearch(one(params.q));
  const supabase = await createClient();
  const lists = await loadPeopleLists(supabase);
  const role = lists.roleName.has(one(params.role)) ? one(params.role) : "";
  const section = lists.sectionName.has(one(params.section)) ? one(params.section) : "";
  const show = ["off", "all"].includes(one(params.show)) ? one(params.show) : "";

  const vetting = one(params.vetting) in VETTING_STATUS ? (one(params.vetting) as VettingStatus) : "";

  // P2.3: each person's vetting status, worked out by the database, beside
  // them (view people_list, migration 0057). Round C2: everyone who matches
  // is counted, but only one page of 50 is read, however many people there are.
  const shown = await pageRows<PersonRow & { vetting_status: VettingStatus | null }>(readPage(params.page), PAGE_SIZE, (from, to) => {
    let query = supabase
      .from("people_list")
      .select(`${PERSON_COLUMNS}, vetting_status`, { count: "exact" })
      .order("full_name")
      .order("id")
      .range(from, to);
    if (q) query = query.or(`full_name.ilike.*${q}*,phone.ilike.*${q}*,email.ilike.*${q}*`);
    if (role) query = query.eq("person_role_id", role);
    if (section) query = query.eq("section_id", section);
    if (show === "") query = query.eq("active", true);
    if (show === "off") query = query.eq("active", false);
    if (vetting) query = query.eq("vetting_status", vetting);
    return query;
  });
  const statuses = new Map(shown.rows.map((p) => [p.id, p.vetting_status]));
  const rows = shown.rows;
  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, role, section, vetting, show })) if (v) p.set(k, v);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/people?${s}` : "/people";
  };
  const vettingBadge = (p: PersonRow) => {
    const v = statuses.get(p.id);
    return v ? <StatusBadge {...VETTING_STATUS[v]} /> : null;
  };

  const filtered = Boolean(q || role || section || show || vetting);
  const field = fieldClass;
  const status = (p: PersonRow) => (p.active ? PERSON_STATUS.active : PERSON_STATUS.off);
  const contact = (p: PersonRow) => [p.phone, p.email].filter(Boolean).join(" · ") || "No contact recorded";

  return (
    <>
      <div className="mt-4">
        <PrimaryLink href="/people/new">Add a person</PrimaryLink>
      </div>
      <form data-folded="true" method="get" className="list-filters grid gap-3 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Search people">
        <label className="lg:col-span-2">
          <span className="font-semibold">Search</span>
          <input name="q" defaultValue={q} placeholder="Name, phone or email" className={field} />
        </label>
        <label>
          <span className="font-semibold">Role</span>
          <select name="role" defaultValue={role} className={field}>
            <option value="">All roles</option>
            {lists.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Section</span>
          <select name="section" defaultValue={section} className={field}>
            <option value="">All sections</option>
            {lists.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Vetting</span>
          <select name="vetting" defaultValue={vetting} className={field}>
            <option value="">Any vetting</option>
            {(Object.keys(VETTING_STATUS) as VettingStatus[]).map((v) => (
              <option key={v} value={v}>
                {VETTING_STATUS[v].word}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Show</span>
          <select name="show" defaultValue={show} className={field}>
            <option value="">Active only</option>
            <option value="off">Switched off only</option>
            <option value="all">Everyone</option>
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900">
            Search
          </button>
          {filtered && (
            <Link href="/people" className="inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green! no-underline hover:bg-icci-green-50">
              Clear filters
            </Link>
          )}
        </div>
        <FilterFold />
      </form>

      <p className="list-count" data-testid="people-count">
        {shown.total === 0 ? "No people match." : `${shown.total} ${shown.total === 1 ? "person" : "people"}`}
      </p>

      {/* A6: an empty list says so in one calm card, with a way out of the filters. */}
      {shown.total === 0 && (
        <div className="mt-4" data-testid="empty-list">
          <EmptyState
            icon={UserSearch}
            title="Nobody matches"
            action={filtered ? <LinkButton href="/people" kind="outline">Clear filters</LinkButton> : undefined}
          >
            {filtered ? "Nothing matches these filters." : "Try other words, or clear the filters to see everyone."}
          </EmptyState>
        </div>
      )}
      <div className={shown.total === 0 ? "hidden" : "list-table-wrap"}>
      <table className="list-table hidden md:table">
        <thead>
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Section</th>
            <th className="px-3 py-2">Contact</th>
            <th className="px-3 py-2">Started</th>
            <th className="px-3 py-2">Vetting</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} data-testid="person-row" className="border-b border-icci-panel align-top">
              <td className="px-3 py-2" dir="auto">
                <Link href={`/people/${p.id}`} className="font-semibold">
                  {p.full_name}
                </Link>
              </td>
              <td className="px-3 py-2">{lists.roleName.get(p.person_role_id)}</td>
              <td className="px-3 py-2">{lists.sectionName.get(p.section_id)}</td>
              <td className="px-3 py-2 text-sm">{contact(p)}</td>
              <td className="px-3 py-2 text-sm whitespace-nowrap">{formatDate(p.start_date)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{vettingBadge(p)}</td>
              <td className="px-3 py-2">
                <StatusBadge {...status(p)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              href={`/people/${p.id}`}
              data-testid="person-row"
              className="list-card"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-icci-green" dir="auto">
                  {p.full_name}
                </span>
                <StatusBadge {...status(p)} />
              </span>
              <span className="mt-1 block text-sm">
                {lists.roleName.get(p.person_role_id)} · {lists.sectionName.get(p.section_id)}
              </span>
              <span className="block text-sm">{contact(p)}</span>
              <span className="mt-1 flex items-center gap-2 text-sm">Vetting: {vettingBadge(p)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.pages > 1 && <Pagination page={shown.page} size={PAGE_SIZE} total={shown.total} hrefFor={pageLink} />}
    </>
  );
}
