// The renewals register (slice P2.8, PLAN.md 5.2): everything the Centre
// must renew, worst first. Typed-in renewals plus dates read from vehicles,
// Garda vetting, policy reviews and asset warranties; each row opens where
// its date lives. Overdue is red, due within 60 days amber, up to date green,
// an ended warranty grey. Designed for a PC first; one card per row on a
// phone. Super Admin and Centre Admin only.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterFold } from "@/components/ui/filter-fold";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate } from "@/lib/items/rules";
import {
  DUE_WITHIN_DAYS,
  dueLine,
  hrefOf,
  MAY_SEE_RENEWALS,
  readRegisterFilter,
  REGISTER_STATUS,
  SOURCE_GROUPS,
  SOURCE_LABEL,
  type RegisterFilter,
  type RegisterRow,
} from "@/lib/renewals/rules";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, todayInDublin } from "@/lib/vetting/rules";
import { loadRegisterPage, ownerNames } from "./data";
import { CannotSee, fieldClass, Pagination, PrimaryLink, SecondaryLink, Skeleton, StatusBadge } from "@/components/ui";
import { PAGE_SIZE, readPage } from "@/lib/ui/text";

export const metadata: Metadata = { title: "Renewals | ICCI Control Dashboard" };

const SHOW_LABEL: Record<RegisterFilter["show"], string> = {
  attention: "Needs attention (overdue or due soon)",
  soon: "Overdue or due in 30 days",
  ok: "Up to date",
  ended: "Warranties that have ended",
  all: "Everything",
};

export default function RenewalsPage(props: PageProps<"/renewals">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Renewals</h1>
      <p className="mt-2">
        Everything that must be renewed, worst first. &ldquo;Due soon&rdquo; means within {DUE_WITHIN_DAYS} days. Vehicle dates, Garda vetting, policy
        reviews and warranties appear here by themselves.
      </p>
      <Suspense fallback={<Skeleton />}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: Pick<PageProps<"/renewals">, "searchParams">) {
  const me = await requireAdmin();
  if (!MAY_SEE_RENEWALS.includes(me.roleCode)) return <CannotSee area="renewals" />;
  const params = await searchParams;
  const filter = readRegisterFilter(params);
  const supabase = await createClient();
  // Round C2: one page of 50 from the database.
  const { rows, page, total } = await loadRegisterPage(supabase, filter, readPage(params.page), PAGE_SIZE);
  const pageLink = (n: number) => {
    const p = new URLSearchParams({ ...(filter.show !== "attention" && { show: filter.show }), ...(filter.from && { from: filter.from }) });
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/renewals?${s}` : "/renewals";
  };
  const owners = await ownerNames(supabase, rows);
  const today = todayInDublin();
  const filtered = filter.show !== "attention" || filter.from !== "";

  return (
    <>
      <form data-folded="true" method="get" className="list-filters mt-4 grid gap-3 sm:grid-cols-3" aria-label="Filter the renewals register">
        <label>
          <span className="font-semibold">Show</span>
          <select name="show" defaultValue={filter.show === "attention" ? "" : filter.show} className={fieldClass}>
            {(Object.keys(SHOW_LABEL) as RegisterFilter["show"][]).map((s) => (
              <option key={s} value={s === "attention" ? "" : s}>
                {SHOW_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">From</span>
          <select name="from" defaultValue={filter.from} className={fieldClass}>
            <option value="">Everywhere</option>
            {SOURCE_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900"
          >
            Show
          </button>
          {filtered && (
            <Link href="/renewals" className="inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green! no-underline hover:bg-icci-green-50">
              Clear filters
            </Link>
          )}
        </div>
        <FilterFold />
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="renewal-count">
          {rows.length === 0
            ? filter.show === "attention" || filter.show === "soon"
              ? "Nothing is overdue or due soon."
              : "Nothing matches."
            : `${total} ${total === 1 ? "renewal" : "renewals"}`}
        </p>
        <div className="flex flex-wrap gap-3">
          <SecondaryLink href="/reminders">Email reminders</SecondaryLink>
          <PrimaryLink href="/renewals/new">Add a renewal</PrimaryLink>
        </div>
      </div>
      <Rows rows={rows} owners={owners} today={today} />
      {total > PAGE_SIZE && <Pagination page={page} size={PAGE_SIZE} total={total} hrefFor={pageLink} />}
      <p className="mt-4 text-sm">Only dates and short notes are kept here, never the certificates, contracts or policies themselves.</p>
    </>
  );
}

function Due({ r, today }: { r: RegisterRow; today: string }) {
  const days = r.due_on ? daysBetween(today, r.due_on) : null;
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusBadge {...REGISTER_STATUS[r.status]} />
      {r.due_on && <span className="text-sm">{formatDate(r.due_on)}</span>}
      <span className="text-sm">{dueLine(r.due_on, r.status, days)}</span>
    </span>
  );
}

function Rows({ rows, owners, today }: { rows: RegisterRow[]; owners: Map<string, string>; today: string }) {
  if (rows.length === 0) return null;
  const owner = (r: RegisterRow) => (r.owner_person_id ? (owners.get(r.owner_person_id) ?? "Someone") : "Nobody");
  return (
    <>
      <div className="list-table-wrap">
        <table className="list-table hidden md:table">
          <thead>
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">What</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">From</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.source}:${r.record_id}`} data-testid="renewal-row" data-status={r.status} className="border-b border-icci-panel align-top">
                <td className="px-3 py-2">
                  <Due r={r} today={today} />
                </td>
                <td className="px-3 py-2" dir="auto">
                  <Link href={hrefOf(r)} className="font-semibold">
                    {r.title}
                  </Link>
                  {r.note && <span className="block text-sm">{r.note}</span>}
                </td>
                <td className="px-3 py-2">{r.category}</td>
                <td className="px-3 py-2" dir="auto">
                  {owner(r)}
                </td>
                <td className="px-3 py-2">{SOURCE_LABEL[r.source]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={`${r.source}:${r.record_id}`}>
            <Link href={hrefOf(r)} data-testid="renewal-row" data-status={r.status} className="list-card">
              <span className="font-semibold text-icci-green" dir="auto">
                {r.title}
              </span>
              <span className="mt-1 block text-sm">
                {r.category} · Owner: <span dir="auto">{owner(r)}</span>
              </span>
              {r.note && <span className="block text-sm">{r.note}</span>}
              <span className="mt-2 block">
                <Due r={r} today={today} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
