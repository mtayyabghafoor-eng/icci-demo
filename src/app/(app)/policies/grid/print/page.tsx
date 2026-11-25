// The policy grid, ready to print (slice P2.6): A4 landscape, the same
// filters as the grid page, with the date it was printed. "Save as PDF" in the
// browser's print window makes a file, the same way label sheets work.
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate } from "@/lib/items/rules";
import { MAY_SEE_POLICIES } from "@/lib/policies/rules";
import { filterSquares, gridQuery, OVERDUE_DAYS, readGridFilter, SIGNOFF_STATUS } from "@/lib/policies/signoffs";
import { loadGridSquares } from "../data";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { PrintNowButton } from "../../../labels/forms";
import { loadPeopleLists } from "../../../people/data";
import { CannotSeePolicies } from "../../cannot-see";
import { GridTable } from "../grid-table";
import { BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Policy grid (print) | ICCI Control Dashboard" };

export default function PolicyGridPrintPage(props: PageProps<"/policies/grid/print">) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 print:m-0 print:max-w-none print:p-0">
      <Suspense fallback={<p>Loading…</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/policies/grid/print">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_POLICIES.includes(me.roleCode)) return <CannotSeePolicies />;
  const params = await searchParams;
  const supabase = await createClient();
  const [lists, all] = await Promise.all([loadPeopleLists(supabase), loadGridSquares(supabase)]);
  const filter = readGridFilter(params, new Set(lists.sectionName.keys()), new Set(lists.roleName.keys()));
  const squares = filterSquares(all, filter);
  const back = gridQuery(filter);
  const chosen = [
    filter.section && `Section: ${lists.sectionName.get(filter.section)}`,
    filter.role && `Role: ${lists.roleName.get(filter.role)}`,
    filter.status && `People with: ${filter.status === "attention" ? "Overdue or not signed" : SIGNOFF_STATUS[filter.status].word}`,
  ].filter(Boolean);

  return (
    <div className="policy-grid-page">
      <div className="print:hidden">
        <BackLink href={`/policies/grid${back ? `?${back}` : ""}`}>Policy grid</BackLink>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <PrintNowButton />
          <span className="text-sm">In the print window choose A4 and landscape. &ldquo;Save as PDF&rdquo; makes a file.</span>
        </div>
      </div>
      <h1 className="mt-4 text-xl font-semibold print:mt-0">ICCI policy sign-offs</h1>
      <p className="text-sm">
        Printed {formatDate(todayInDublin())}. {chosen.length ? `${chosen.join(" · ")}. ` : ""}Overdue = unsigned {OVERDUE_DAYS} days after
        publishing. &ldquo;–&rdquo; = does not apply.
      </p>
      <GridTable squares={squares} roleName={lists.roleName} sectionName={lists.sectionName} print />
    </div>
  );
}
