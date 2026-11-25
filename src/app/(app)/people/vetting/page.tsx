// The Garda vetting list (slice P2.3): everyone switched on whose vetting
// matters, worst first (expired, not vetted, due soon, applied, valid).
// Filter by status and section; CSV download. Designed for a PC first; one
// card per person on a phone. Super Admin and Centre Admin only.
import type { Metadata } from "next";
import { Pagination } from "@/components/ui";
import { FilterFold } from "@/components/ui/filter-fold";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_PEOPLE } from "@/lib/people/rules";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, pageOf, readPage } from "@/lib/ui/text";
import { statusLine, todayInDublin, VETTING_STATUS, VETTING_YEARS, type VettingStatus } from "@/lib/vetting/rules";
import { SecondaryLink, StatusBadge } from "../../items/ui";
import { CannotSeePeople } from "../cannot-see";
import { loadPeopleLists } from "../data";
import { loadVettingList, readVettingFilter } from "./data";

export const metadata: Metadata = { title: "Garda vetting | ICCI Control Dashboard" };

const STATUS_ORDER: VettingStatus[] = ["expired", "none", "due", "applied", "valid", "not_required"];

export default function VettingListPage(props: PageProps<"/people/vetting">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Garda Vetting</h1>
      <p className="mt-2">
        Everyone who needs vetting, worst first. A vetting is valid for {VETTING_YEARS} years unless a different expiry was
        entered. &ldquo;Due soon&rdquo; means it expires within 60 days.
      </p>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/people/vetting">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_PEOPLE.includes(me.roleCode)) return <CannotSeePeople />;
  const params = await searchParams;
  const supabase = await createClient();
  const lists = await loadPeopleLists(supabase);
  const filter = readVettingFilter(params, new Set(lists.sectionName.keys()));
  // Everyone who matches is counted, worst first; one page of 50 is drawn.
  const shown = pageOf(await loadVettingList(supabase, filter), readPage(params.page), PAGE_SIZE);
  const rows = shown.rows;
  const today = todayInDublin();
  const field = "mt-1 block min-h-11 w-full rounded-xl border border-[#87948f] bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green";
  const filtered = Boolean(filter.status || filter.section || filter.showNotRequired);
  const filterParams = {
    ...(filter.status && { status: filter.status }),
    ...(filter.section && { section: filter.section }),
    ...(filter.showNotRequired && { all: "yes" }),
  };
  // The CSV always holds everyone who matches, not only this page.
  const csvHref = `/people/vetting/csv?${new URLSearchParams(filterParams)}`;
  const pageLink = (n: number) => {
    const p = new URLSearchParams(filterParams);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/people/vetting?${s}` : "/people/vetting";
  };

  return (
    <>
      <form data-folded="true" method="get" className="list-filters grid gap-3 sm:grid-cols-3" aria-label="Filter the vetting list">
        <label>
          <span className="font-semibold">Status</span>
          <select name="status" defaultValue={filter.status} className={field}>
            <option value="">All that need vetting</option>
            <option value="attention">Expired, not vetted or due</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {VETTING_STATUS[s].word}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Section</span>
          <select name="section" defaultValue={filter.section} className={field}>
            <option value="">All sections</option>
            {lists.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end">
          <input type="checkbox" name="all" value="yes" defaultChecked={filter.showNotRequired} className="h-5 w-5" />
          <span>Also show people who do not need vetting</span>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900">
            Show
          </button>
          {filtered && (
            <Link href="/people/vetting" className="inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green! no-underline hover:bg-icci-green-50">
              Clear filters
            </Link>
          )}
        </div>
        <FilterFold />
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="vetting-count">{shown.total === 0 ? "Nobody matches." : `${shown.total} ${shown.total === 1 ? "person" : "people"}`}</p>
        <SecondaryLink href={csvHref}>Download CSV</SecondaryLink>
      </div>

      <div className="list-table-wrap">
      <table className="list-table hidden md:table">
        <thead>
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Section</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.person_id} data-testid="vetting-row" className="border-b border-icci-panel align-top">
              <td className="px-3 py-2" dir="auto">
                <Link href={`/people/${r.person_id}`} className="font-semibold">
                  {r.full_name}
                </Link>
              </td>
              <td className="px-3 py-2">{lists.roleName.get(r.person_role_id)}</td>
              <td className="px-3 py-2">{lists.sectionName.get(r.section_id)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <StatusBadge {...VETTING_STATUS[r.status]} />
              </td>
              <td className="px-3 py-2 text-sm">{statusLine(r, today)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.person_id}>
            <Link
              href={`/people/${r.person_id}`}
              data-testid="vetting-row"
              className="list-card"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-icci-green" dir="auto">
                  {r.full_name}
                </span>
                <StatusBadge {...VETTING_STATUS[r.status]} />
              </span>
              <span className="mt-1 block text-sm">
                {lists.roleName.get(r.person_role_id)} · {lists.sectionName.get(r.section_id)}
              </span>
              <span className="block text-sm">{statusLine(r, today)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.pages > 1 && <Pagination page={shown.page} size={PAGE_SIZE} total={shown.total} hrefFor={pageLink} />}
      <p className="mt-4 text-sm">Switched-off people are left out. Only the status and dates are kept, never the disclosure itself.</p>
    </>
  );
}
