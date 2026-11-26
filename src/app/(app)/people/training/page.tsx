// The training list (slice P2.4): the newest course of each type for every
// switched-on person, worst first (expired, due soon, valid, no expiry).
// Filter by training, status and section; CSV download. Designed for a PC
// first; one card per row on a phone. Super Admin and Centre Admin only.
// Only recorded training is shown (owner's choice, 16 Nov 2026).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CannotSee, fieldClass, Pagination, SecondaryLink, Skeleton, StatusBadge } from "@/components/ui";
import { FilterFold } from "@/components/ui/filter-fold";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_PEOPLE } from "@/lib/people/rules";
import { createClient } from "@/lib/supabase/server";
import { DUE_WITHIN_DAYS, STATUS_ORDER, TRAINING_STATUS, trainingLine } from "@/lib/training/rules";
import { PAGE_SIZE, readPage } from "@/lib/ui/text";
import { todayInDublin } from "@/lib/vetting/rules";
import { loadPeopleLists } from "../data";
import { loadTrainingPage, loadTrainingTypes, readTrainingFilter } from "./data";

export const metadata: Metadata = { title: "Training | ICCI Control Dashboard" };

export default function TrainingListPage(props: PageProps<"/people/training">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Training</h1>
      <p className="mt-2">
        Training recorded for each person, worst first. &ldquo;Due soon&rdquo; means it expires within {DUE_WITHIN_DAYS} days.
        Only the newest course of each type counts.
      </p>
      <Suspense fallback={<Skeleton />}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/people/training">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_PEOPLE.includes(me.roleCode)) return <CannotSee area="people" />;
  const params = await searchParams;
  const supabase = await createClient();
  const [lists, types] = await Promise.all([loadPeopleLists(supabase), loadTrainingTypes(supabase)]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const filter = readTrainingFilter(params, new Set(typeName.keys()), new Set(lists.sectionName.keys()));
  const shown = await loadTrainingPage(supabase, filter, readPage(params.page), PAGE_SIZE);
  const rows = shown.rows;
  const today = todayInDublin();
  const field = fieldClass;
  const filtered = Boolean(filter.status || filter.type || filter.section);
  const filterParams = {
    ...(filter.type && { type: filter.type }),
    ...(filter.status && { status: filter.status }),
    ...(filter.section && { section: filter.section }),
  };
  // The CSV always holds every row that matches, not only this page.
  const csvHref = `/people/training/csv?${new URLSearchParams(filterParams)}`;
  const pageLink = (n: number) => {
    const p = new URLSearchParams(filterParams);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/people/training?${s}` : "/people/training";
  };

  return (
    <>
      <form data-folded="true" method="get" className="list-filters grid gap-3 sm:grid-cols-3" aria-label="Filter the training list">
        <label>
          <span className="font-semibold">Training</span>
          <select name="type" defaultValue={filter.type} className={field}>
            <option value="">All training</option>
            {types
              .filter((t) => t.active || t.id === filter.type)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.active ? "" : " (switched off)"}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Status</span>
          <select name="status" defaultValue={filter.status} className={field}>
            <option value="">Any status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {TRAINING_STATUS[s].word}
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
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900">
            Show
          </button>
          {filtered && (
            <Link href="/people/training" className="inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green! no-underline hover:bg-icci-green-50">
              Clear filters
            </Link>
          )}
        </div>
        <FilterFold />
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="training-count">
          {shown.total === 0 ? "Nothing matches." : `${shown.total} ${shown.total === 1 ? "entry" : "entries"}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <SecondaryLink href="/people/training/types">Training types</SecondaryLink>
          <SecondaryLink href={csvHref}>Download CSV</SecondaryLink>
        </div>
      </div>

      <div className="list-table-wrap">
        <table className="list-table hidden md:table">
          <thead>
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Section</th>
              <th className="px-3 py-2">Training</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.person_id}-${r.training_type_id}`} data-testid="training-row" className="border-b border-icci-panel align-top">
                <td className="px-3 py-2" dir="auto">
                  <Link href={`/people/${r.person_id}`} className="font-semibold">
                    {r.full_name}
                  </Link>
                </td>
                <td className="px-3 py-2">{lists.sectionName.get(r.section_id)}</td>
                <td className="px-3 py-2">{typeName.get(r.training_type_id)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusBadge {...TRAINING_STATUS[r.status]} />
                </td>
                <td className="px-3 py-2 text-sm">{trainingLine(r, today)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={`${r.person_id}-${r.training_type_id}`}>
            <Link href={`/people/${r.person_id}`} data-testid="training-row" className="list-card">
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-icci-green" dir="auto">
                  {r.full_name}
                </span>
                <StatusBadge {...TRAINING_STATUS[r.status]} />
              </span>
              <span className="mt-1 block text-sm">
                {typeName.get(r.training_type_id)} · {lists.sectionName.get(r.section_id)}
              </span>
              <span className="block text-sm">{trainingLine(r, today)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.pages > 1 && <Pagination page={shown.page} size={PAGE_SIZE} total={shown.total} hrefFor={pageLink} />}
      <p className="mt-4 text-sm">Switched-off people are left out. Only the type and dates are kept, never the certificate.</p>
    </>
  );
}
