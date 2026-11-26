// The policy grid (slice P2.6): everyone who must sign something, against
// each policy's current version. Filter by section, role and status; a print
// view gives an A4 page. Designed for a PC first; the table scrolls sideways
// on a phone. Super Admin and Centre Admin only.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BackLink, buttonClass, CannotSee, fieldClass, PageNotice, SecondaryLink, Skeleton } from "@/components/ui";
import { FilterFold } from "@/components/ui/filter-fold";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_POLICIES } from "@/lib/policies/rules";
import { filterSquares, gridQuery, OVERDUE_DAYS, readGridFilter, SIGNOFF_STATUS, SQUARE_ORDER } from "@/lib/policies/signoffs";
import { createClient } from "@/lib/supabase/server";
import { loadPeopleLists } from "../../people/data";
import { loadGridSquares } from "./data";
import { GridTable } from "./grid-table";

export const metadata: Metadata = { title: "Policy grid | ICCI Control Dashboard" };

export default function PolicyGridPage(props: PageProps<"/policies/grid">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <BackLink href="/policies">Policies</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Policy Grid</h1>
      <p className="mt-2">
        Who has signed the current version of each policy. &ldquo;Overdue&rdquo; means still unsigned {OVERDUE_DAYS} days after
        publishing. &ldquo;–&rdquo; means the policy does not apply to that person&rsquo;s role.
      </p>
      <Suspense fallback={<Skeleton />}>
        <Grid searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Grid({ searchParams }: { searchParams: PageProps<"/policies/grid">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_POLICIES.includes(me.roleCode)) return <CannotSee area="policies" />;
  const params = await searchParams;
  const supabase = await createClient();
  const [lists, all] = await Promise.all([loadPeopleLists(supabase), loadGridSquares(supabase)]);
  const filter = readGridFilter(params, new Set(lists.sectionName.keys()), new Set(lists.roleName.keys()));
  const squares = filterSquares(all, filter);
  const field = fieldClass;
  const filterParams = gridQuery(filter);
  const signed = params.done === "signed" ? Number(params.n) || 0 : 0;
  const filtered = filterParams !== "";
  const counts = SQUARE_ORDER.map((s) => `${squares.filter((q) => q.status === s).length} ${SIGNOFF_STATUS[s].word.toLowerCase()}`).join(", ");

  return (
    <>
      {signed > 0 && (
        <div className="mb-4">
          <PageNotice>
            Sign-off recorded for {signed} {signed === 1 ? "person" : "people"}.
          </PageNotice>
        </div>
      )}
      <form data-folded="true" method="get" className="list-filters grid gap-3 sm:grid-cols-3" aria-label="Filter the policy grid">
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
        <label>
          <span className="font-semibold">Role</span>
          <select name="role" defaultValue={filter.role} className={field}>
            <option value="">All roles</option>
            {lists.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Show people with</span>
          <select name="status" defaultValue={filter.status} className={field}>
            <option value="">Any status</option>
            <option value="attention">Overdue or not signed</option>
            {SQUARE_ORDER.map((s) => (
              <option key={s} value={s}>
                {SIGNOFF_STATUS[s].word}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <button type="submit" className={buttonClass("primary")}>
            Show
          </button>
          {filtered && (
            <Link href="/policies/grid" className="inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green! no-underline hover:bg-icci-green-50">
              Clear filters
            </Link>
          )}
        </div>
        <FilterFold />
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="grid-count">
          {squares.length === 0 ? "Nothing matches." : `${squares.length} squares: ${counts}.`}
        </p>
        <SecondaryLink href={`/policies/grid/print${filterParams ? `?${filterParams}` : ""}`}>Print view</SecondaryLink>
      </div>
      <GridTable squares={squares} roleName={lists.roleName} sectionName={lists.sectionName} gridQuery={filterParams} />
      <p className="mt-4 text-sm">Switched-off people and policies are left out. Policies with nothing published yet have no squares.</p>
    </>
  );
}
